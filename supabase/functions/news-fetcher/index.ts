// FANCLUV — 팀 뉴스 수집기 (Supabase Edge Function, Deno).
//
// 브라우저는 CORS 때문에 구단 RSS/공식 홈페이지를 직접 못 부른다. 이 함수가 서버에서
// RSS(우선) → 공식 홈페이지(HTML 스크래핑) 순으로 뉴스를 가져와 표준 형태로 정규화하고,
// news_cache 테이블에 10분 캐시한다. 실패 시 마지막 캐시(있으면) → 없으면 빈 배열을
// 돌려주고, 클라이언트(teamNewsProvider)가 관리자 저장 뉴스/ Mock 으로 폴백한다.
//
// 요청 body: { clubId, clubName, rssUrl, newsUrl, officialWebsite }
// 응답: { ok, items: StandardNews[], source: 'cache'|'rss'|'official'|'empty', cachedAt }
//
// ── 신규(0076): action='collect' — 공식 구단 뉴스 → team_news 영속 수집 ──
//   { action:'collect', clubs?: ['jeonbuk',...] }
//   - 호출 권한: service_role bearer(cron/운영) 또는 관리자 사용자 JWT.
//   - Provider 는 이 파일 내 하드코딩 allowlist(CLUB_PROVIDERS)만 사용 → DB 의 임의
//     URL 을 fetch 하지 않는다(SSRF 방어). 허용 도메인 외 요청 불가.
//   - 정규화(HTML→plain text 문단, XSS 원천 차단) → 규칙 분류 → team_news 원자적
//     upsert(UNIQUE team_id+source_article_id) → news_sources 헬스 기록.
//   - Provider 실패는 개별 격리(Promise.allSettled) — 한 구단 장애가 전체를 막지 않음.
//
// 배포(팀 뉴스 페이지는 로그인 사용자만 접근 → 기본 verify_jwt=true 유지):
//   supabase functions deploy news-fetcher
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 플랫폼 자동 주입)
// 마이그레이션: 0019(news_cache) · 0021(news_sources) · 0076(team_news 수집 컬럼)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CACHE_TTL_MIN = 10          // 캐시 유효시간 10분
const MAX_ITEMS = 15              // 구단당 최대 기사 수
const FETCH_TIMEOUT_MS = 8000     // 외부 요청 타임아웃

// ── 유틸 ──
function stripTags(s: string) { return String(s || '').replace(/<[^>]*>/g, ' ') }
function unwrapCdata(s: string) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') }
function decodeEntities(s: string) {
  return String(s || '')
    // 숫자 entity(10진 &#60; / 16진 &#x3c;) 먼저 — 일부 사이트는 og:description 을
    // 숫자 entity 로 이중 인코딩한다(예: 광주 &#60;br&#62;). 미처리 시 태그가 텍스트로 노출.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    // 자주 쓰이는 명명 엔티티(따옴표/대시/생략 등) — 미처리 시 본문에 &lsquo; 등이 노출된다.
    .replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&hellip;/g, '…').replace(/&middot;/g, '·').replace(/&bull;/g, '•')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&trade;/g, '™')
    .replace(/&reg;/g, '®').replace(/&copy;/g, '©').replace(/&deg;/g, '°').replace(/&times;/g, '×')
    .replace(/&amp;/g, '&')
}
function clean(s: string, max = 300) {
  const out = decodeEntities(stripTags(unwrapCdata(s))).replace(/\s+/g, ' ').trim()
  return out.length > max ? out.slice(0, max - 1) + '…' : out
}
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return m ? m[1] : null
}
// 안정적인 짧은 id(링크/제목 해시).
function hashId(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}
async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'FANCLUV-news-fetcher/1.0', Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8' },
    })
    if (!res.ok) throw new Error(`http ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// 표준 뉴스 형태로 정규화 (요구사항 4).
function toStandard(raw: Record<string, unknown>, clubId: string, clubName: string, isOfficial = true) {
  const link = String(raw.link || '')
  return {
    id: `ext-${clubId}-${hashId(link || String(raw.title || Math.random()))}`,
    clubId,
    title: String(raw.title || '').slice(0, 200),
    summary: String(raw.summary || ''),
    imageUrl: String(raw.imageUrl || ''),
    source: clubName ? `${clubName} 공식` : '구단 공식',
    sourceUrl: link || null,
    publishedAt: String(raw.publishedAt || ''),
    category: String(raw.category || '뉴스'),
    isOfficial,
  }
}

// ── RSS / Atom 파싱 ──
function parseFeed(xml: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  // RSS <item>
  const rssBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  for (const b of rssBlocks) {
    const title = clean(tag(b, 'title') || '', 200)
    if (!title) continue
    const linkRaw = tag(b, 'link') || ''
    const link = clean(linkRaw, 500) || (linkRaw.match(/https?:\/\/[^\s<"]+/)?.[0] ?? '')
    const desc = clean(tag(b, 'description') || tag(b, 'content:encoded') || '', 300)
    const pub = clean(tag(b, 'pubDate') || tag(b, 'dc:date') || '', 60)
    const img =
      b.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] ||
      b.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ||
      b.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1] ||
      (tag(b, 'description') || '').match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
    items.push({ title, link, summary: desc, publishedAt: pub, imageUrl: img })
  }
  if (items.length) return items
  // Atom <entry>
  const atomBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || []
  for (const b of atomBlocks) {
    const title = clean(tag(b, 'title') || '', 200)
    if (!title) continue
    const link = b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || ''
    const desc = clean(tag(b, 'summary') || tag(b, 'content') || '', 300)
    const pub = clean(tag(b, 'published') || tag(b, 'updated') || '', 60)
    const img = b.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
    items.push({ title, link, summary: desc, publishedAt: pub, imageUrl: img })
  }
  return items
}

// ── 공식 홈페이지 최소 스크래핑(제목+링크). 사이트마다 구조가 달라 best-effort. ──
function scrapeOfficial(html: string, baseUrl: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) && items.length < MAX_ITEMS) {
    const href = m[1]
    const text = clean(m[2], 120)
    // 뉴스/공지처럼 보이는 링크만(제목 길이 + 키워드 힌트).
    if (text.length < 8) continue
    if (!/news|notice|board|article|view|보도|뉴스|공지|소식/i.test(href)) continue
    let link = href
    try { link = new URL(href, baseUrl).href } catch { /* 상대경로 실패 무시 */ }
    if (seen.has(link)) continue
    seen.add(link)
    items.push({ title: text, link, summary: '', publishedAt: '', imageUrl: '' })
  }
  return items
}

// ════════════════════════════════════════════════════════════════════════════
//  0076 — 공식 구단 뉴스 영속 수집 (action='collect')
// ════════════════════════════════════════════════════════════════════════════

// 수집 시 원문 사이트에 보내는 UA(봇 명시) + 상세 fetch 상한(원 사이트 부하 보호)
const COLLECT_UA = 'Mozilla/5.0 (compatible; FANCLUV-NewsBot/1.0; +https://fancluv.com)'
const COLLECT_TIMEOUT_MS = 10000
const MAX_COLLECT_ITEMS = 12       // provider당 목록 최신 N건만
const MAX_DETAIL_FETCH = 8         // 실행당 신규 상세 fetch 상한

type CollectedItem = {
  team_id: string
  source_article_id: string        // provider 안정 ID (dedup 키)
  title: string
  content: string                  // plain text 문단(\n\n) — HTML 저장 금지(XSS 원천 차단)
  excerpt: string
  image_url: string
  source_name: string
  source_url: string               // 원문 기사 URL
  published_at: string | null      // ISO
  category: string
}

interface ClubProvider {
  clubId: string
  clubName: string
  allowedHosts: string[]           // SSRF 방어: 이 호스트 외 fetch 금지
  collect(): Promise<CollectedItem[]>
}

// 수집 fetch 공통(타임아웃 + 1회 재시도 + 호스트 allowlist 강제)
async function collectFetch(url: string, hosts: string[], asJson = false): Promise<string> {
  const host = new URL(url).hostname
  if (!hosts.includes(host)) throw new Error(`host_not_allowed:${host}`)
  const tryOnce = async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), COLLECT_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': COLLECT_UA, Accept: asJson ? 'application/json' : 'text/html,application/xhtml+xml' },
      })
      if (!res.ok) throw new Error(`http_${res.status}`)
      return await res.text()
    } finally { clearTimeout(timer) }
  }
  try { return await tryOnce() } catch (e) {
    // 일시 오류 1회 재시도(backoff 1.5s). 4xx 는 재시도 무의미하지만 판단 단순화 위해 1회만.
    if (String(e).includes('http_4')) throw e
    await new Promise(r => setTimeout(r, 1500))
    return await tryOnce()
  }
}

// HTML → plain text 문단 배열 → '\n\n' 결합. 태그/스크립트 완전 제거(XSS 원천 차단).
// 일부 사이트는 본문을 이중 인코딩(&amp;lt;img&amp;gt;)하거나 HTML 주석을 남긴다 →
// 주석 제거 + 디코드↔태그제거를 최대 2회 반복해 숨은 태그까지 환원·제거한다.
function htmlToParagraphs(html: string): string {
  let s = String(html || '')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')                         // HTML 주석 제거
  for (let i = 0; i < 2; i++) {
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    s = stripTags(s)
    const dec = decodeEntities(s)
    if (dec === s) break                                          // 더 디코드할 게 없으면 종료
    s = dec                                                       // 디코드로 드러난 태그를 다음 루프에서 제거
  }
  s = s.replace(/<[^>]*>/g, ' ')                                  // 완전한 태그 제거
  s = s.replace(/<[a-zA-Z/!][^<]*$/, ' ')                         // 슬라이스가 태그 중간을 잘라 남긴 미완결 <tag 제거(끝단)
  const paras = s.split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length > 1)
  return paras.join('\n\n').slice(0, 20000)
}

// 규칙 기반 카테고리(제목 키워드 → FANCLUV UI 카테고리). 불확실하면 '구단 공지'.
function categorize(title: string): string {
  const t = String(title || '')
  if (/이적|영입|계약|임대|완전\s*이적|재계약/.test(t)) return '이적'
  if (/인터뷰|일문일답|미디어데이/.test(t)) return '인터뷰'
  if (/프리뷰|리뷰|경기|매치|라운드|승리|무승부|역전|결승|선제골|데뷔골/.test(t)) return '경기'
  if (/이벤트|팬\s*사인|행사|할인|증정|프로모션|팬미팅/.test(t)) return '이벤트'
  if (/선수단|선수|부상|복귀|명단|소집|승선|콜업/.test(t)) return '선수'
  return '구단 공지'
}

// 간단 해시(제목+본문 변경 감지)
function contentHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

function absUrl(href: string, base: string): string {
  try { return new URL(href, base).href } catch { return '' }
}
// URL 내 공백 등 안전 인코딩(이미지 src 저장용) — 이미 인코딩된 경우 중복 인코딩 방지.
function safeUrl(u: string): string {
  const s = String(u || '')
  if (!s) return ''
  try { return /%[0-9a-fA-F]{2}/.test(s) ? s : encodeURI(s) } catch { return s }
}
// 특정 컨테이너의 내부 HTML을 대략 추출(중첩 div 정밀 매칭 대신 시작~경계 슬라이스).
// 헤더/푸터/댓글/버튼 영역이 뒤따르면 endRes 중 가장 가까운 경계에서 자른다.
function sliceBlock(html: string, startRe: RegExp, endRes: RegExp[] = [], max = 16000): string {
  const m = html.match(startRe)
  if (!m || m.index == null) return ''
  const from = m.index + m[0].length
  const seg = html.slice(from, from + max)
  let cut = seg.length
  for (const er of endRes) { const e = seg.search(er); if (e >= 0 && e < cut) cut = e }
  return seg.slice(0, cut)
}
// 블록 내 첫 콘텐츠 이미지(상대경로 허용) — 사이트 로고/아이콘은 최대한 회피.
function firstImg(block: string): string {
  const re = /<img[^>]+(?:data-src|src)=["']([^"']+\.(?:jpe?g|png|webp|gif)[^"']*)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const u = m[1]
    if (/logo|icon|blank|spacer|btn_|sns|footer|common\//i.test(u)) continue
    return u
  }
  return ''
}
function isoDate(dateStr: string, timeStr = ''): string | null {
  const m = String(dateStr || '').match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/)
  if (!m) return null
  const t = String(timeStr || '').match(/(\d{2}):(\d{2})(?::(\d{2}))?/)
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${t ? `${t[1]}:${t[2]}:${t[3] || '00'}` : '09:00:00'}+09:00`
  const d = new Date(iso)
  if (isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000) return null // 미래/비정상 제외
  return d.toISOString()
}

// ── Provider: 전북 현대 (공개 JSON API — 사이트가 사용하는 동일 endpoint) ──
const jeonbukProvider: ClubProvider = {
  clubId: 'jeonbuk', clubName: '전북 현대 모터스',
  allowedHosts: ['api.jbfc.kr'],
  async collect() {
    const raw = await collectFetch('https://api.jbfc.kr/media/list/news?page=1', this.allowedHosts, true)
    const list = (JSON.parse(raw)?.body?.list || []).slice(0, MAX_COLLECT_ITEMS)
    const out: CollectedItem[] = []
    for (const it of list) {
      const seq = String(it.seq || '')
      const title = decodeEntities(String(it.Title || '')).trim()
      if (!seq || !title) continue
      out.push({
        team_id: 'jeonbuk', source_article_id: seq, title: title.slice(0, 300),
        content: '',                                     // 상세에서 채움(신규만)
        excerpt: clean(String(it.TopContent || ''), 200),
        image_url: /^https?:\/\//.test(String(it.TopImage || '')) ? String(it.TopImage) : '',
        source_name: '전북 현대 모터스',
        source_url: `https://hyundai-motorsfc.com/media/news/${seq}`,
        published_at: isoDate(String(it.RegiDate || ''), String(it.RegiTime || '')),
        category: categorize(title),
      })
    }
    return out
  },
}
// 전북 상세 본문(JSON) — 신규 기사만 호출
async function jeonbukDetail(seq: string): Promise<string> {
  const raw = await collectFetch(`https://api.jbfc.kr/media/detail/news/${seq}`, jeonbukProvider.allowedHosts, true)
  const data = JSON.parse(raw)?.body?.current?.data
  const row = Array.isArray(data) ? data[0] : data
  return htmlToParagraphs(String(row?.Content || ''))
}

// ── Provider: 김천 상무 (서버렌더 HTML — photo_list 게시판) ──
const gimcheonProvider: ClubProvider = {
  clubId: 'gimcheon', clubName: '김천 상무 프로축구단',
  allowedHosts: ['www.gimcheonfc.com'],
  async collect() {
    const base = 'https://www.gimcheonfc.com/bd/'
    const html = await collectFetch('https://www.gimcheonfc.com/bd/bd_l.php?buid=news02', this.allowedHosts)
    const out: CollectedItem[] = []
    const boxRe = /<div class="box">\s*<a href="(bd_v\.php\?[^"]*wr_id=(\d+)[^"]*)">([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = boxRe.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const href = m[1], id = m[2], inner = m[3]
      const title = clean(inner.match(/<h4>([\s\S]*?)<\/h4>/i)?.[1] || '', 300)
      if (!title) continue
      const img = inner.match(/url\('([^']+)'\)/i)?.[1] || ''
      const date = inner.match(/<p>\s*(20\d{2}-\d{2}-\d{2})/i)?.[1] || ''
      out.push({
        team_id: 'gimcheon', source_article_id: id, title,
        content: '', excerpt: '',
        image_url: img ? absUrl(img, base) : '',
        source_name: '김천 상무',
        source_url: absUrl(href, base),
        published_at: isoDate(date),
        category: categorize(title),
      })
    }
    return out
  },
}
// 김천 상세 본문 — board_view 블록만 추출 후 텍스트화(헤더/푸터/메뉴 미저장)
async function gimcheonDetail(id: string): Promise<string> {
  const html = await collectFetch(`https://www.gimcheonfc.com/bd/bd_v.php?wr_id=${id}&buid=news02`, gimcheonProvider.allowedHosts)
  const block = html.match(/<div class="board_view">([\s\S]*?)<div class="board_(?:list|btn|prev)/i)?.[1]
    || html.match(/<div class="board_view">([\s\S]{0,30000})/i)?.[1] || ''
  // 제목/댓글 영역 제외를 위해 board_title 이후만
  const bodyPart = block.split(/<div class="board_title">[\s\S]*?<\/div>/i).pop() || block
  return htmlToParagraphs(bodyPart)
}

// ── Provider: 광주FC (서버렌더 HTML — gallery_notice 게시판, 상세는 og 메타) ──
const gwangjuProvider: ClubProvider = {
  clubId: 'gwangju', clubName: '광주FC',
  allowedHosts: ['www.gwangjufc.com'],
  async collect() {
    const base = 'https://www.gwangjufc.com/gwboard/'
    const html = await collectFetch('https://www.gwangjufc.com/gwboard/gwboard_list.php?board_type=31', this.allowedHosts)
    const out: CollectedItem[] = []
    const blockRe = /<div class="gallery_notice">([\s\S]*?)<\/div>\s*<\/div>/gi
    let m: RegExpExecArray | null
    while ((m = blockRe.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const b = m[1]
      const a = b.match(/<a href="([^"]*gwboard_view\.php\?[^"]*document_srl=(\d+)[^"]*)">([\s\S]*?)<\/a>/i)
      if (!a) continue
      const id = a[2]
      const title = clean(a[3].replace(/<span class="new">[\s\S]*?<\/span>/i, ''), 300)
      if (!title) continue
      const img = b.match(/<img src="([^"]+)"/i)?.[1] || ''
      const date = b.match(/class="date">\s*(20\d{2}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?/i)
      out.push({
        team_id: 'gwangju', source_article_id: id, title,
        content: '', excerpt: '',
        image_url: img ? absUrl(img, base) : '',
        source_name: '광주FC',
        source_url: `https://www.gwangjufc.com/gwboard/gwboard_view.php?document_srl=${id}&board_type=31`,
        published_at: isoDate(date?.[1] || '', date?.[2] || ''),
        category: categorize(title),
      })
    }
    return out
  },
}
// 광주 상세 본문 — og:description(기사 전문 포함)을 텍스트화. og:image 로 이미지 보강.
async function gwangjuDetail(id: string): Promise<{ content: string; image: string }> {
  const html = await collectFetch(`https://www.gwangjufc.com/gwboard/gwboard_view.php?document_srl=${id}&board_type=31`, gwangjuProvider.allowedHosts)
  const desc = html.match(/<meta property="og:description" content="([\s\S]*?)"\s*\/>/i)?.[1] || ''
  const img = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || ''
  return { content: htmlToParagraphs(decodeEntities(desc)), image: /^https?:\/\//.test(img) ? img : '' }
}

type DetailResult = string | { content: string; image?: string; date?: string | null }

// ── Provider: FC서울 (서버렌더 HTML — /media/newsList, 상세 /media/newsView) ──
// 목록: newsView?seq=ID 앵커(그리드=span.news+제목 / 프리뷰=p.txt). 이미지는 상세에서 보강.
const seoulProvider: ClubProvider = {
  clubId: 'seoul', clubName: 'FC서울',
  allowedHosts: ['www.fcseoul.com'],
  async collect() {
    const html = await collectFetch('https://www.fcseoul.com/media/newsList', this.allowedHosts)
    const out: CollectedItem[] = []
    const seen = new Set<string>()
    const re = /<a href="(\/media\/newsView[^"]*?seq=(\d+)[^"]*)">([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const id = m[2], inner = m[3]
      if (seen.has(id)) continue
      // 제목: p.txt(프리뷰) 또는 span.news 뒤 <span>제목</span>(그리드)
      const title = clean(inner.match(/<p class="txt">([\s\S]*?)<\/p>/i)?.[1]
        || inner.match(/<span class="news">[\s\S]*?<\/span>\s*<span>([\s\S]*?)<\/span>/i)?.[1] || '', 300)
      if (!title) continue
      seen.add(id)
      const img = inner.match(/<img src="([^"]+)"/i)?.[1] || ''
      out.push({
        team_id: 'seoul', source_article_id: id, title, content: '', excerpt: '',
        image_url: img ? safeUrl(absUrl(img, 'https://www.fcseoul.com/')) : '',
        source_name: 'FC서울',
        source_url: `https://www.fcseoul.com/media/newsView?seq=${id}&resultPart=News`,
        published_at: null, category: categorize(title),
      })
    }
    return out
  },
}
async function seoulDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://www.fcseoul.com/media/newsView?seq=${id}&resultPart=News`, seoulProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="txtWrap"[^>]*>/i, [/<div class="(?:btn|sns|list|paging)/i])
  const dateReg = sliceBlock(html, /<div class="txtTit"[^>]*>|<div class="tit"[^>]*>/i, [], 800) + block.slice(0, 200)
  const d = dateReg.match(/20\d{2}[-.]\s?\d{1,2}[-.]\s?\d{1,2}/)?.[0] || ''
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://www.fcseoul.com/')), date: isoDate(d) }
}

// ── Provider: 울산 HD (서버렌더 HTML 게시판, 2개 소스 news_g/presskits) ──
// source_article_id 에 buid 프리픽스 → 두 게시판 no_seq 충돌 방지.
// 울산 news_g: 표(table) 게시판. no_seq 프리픽스로 게시판 구분(충돌 방지).
async function ulsanNewsBoard(): Promise<CollectedItem[]> {
  const html = await collectFetch('https://www.uhdfc.com/board/board.php?buid=news_g', ['www.uhdfc.com'])
  const out: CollectedItem[] = []
  const re = /<a href="board_view\.php\?[^"]*no_seq=(\d+)[^"]*buid=news_g[^"]*">([^<]+)<\/a>[\s\S]{0,80}?<td>(\d{4}-\d{2}-\d{2})/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < 6) {
    const id = m[1], title = clean(m[2], 300)
    if (!title) continue
    out.push({
      team_id: 'ulsan', source_article_id: `news_g:${id}`, title, content: '', excerpt: '',
      image_url: '', source_name: '울산 HD',
      source_url: `https://www.uhdfc.com/board/board_view.php?no_seq=${id}&buid=news_g`,
      published_at: isoDate(m[3]), category: '구단 공지',
    })
  }
  return out
}
// 울산 presskits(리뷰·프리뷰): 썸네일 갤러리(board_thum). h3 제목 + 대표 이미지.
async function ulsanPressBoard(): Promise<CollectedItem[]> {
  const html = await collectFetch('https://www.uhdfc.com/board/board.php?buid=presskits', ['www.uhdfc.com'])
  const out: CollectedItem[] = []
  const re = /<div class="box">\s*<div class="img">\s*<a href="board_view\.php\?[^"]*no_seq=(\d+)[^"]*buid=presskits[^"]*">\s*<img src="([^"]*)"[\s\S]*?<h3>([\s\S]*?)<\/h3>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < 6) {
    const id = m[1], img = m[2], title = clean((m[3] || '').replace(/<span>[\s\S]*?<\/span>/gi, ''), 300)
    if (!title) continue
    out.push({
      team_id: 'ulsan', source_article_id: `presskits:${id}`, title, content: '', excerpt: '',
      image_url: img ? safeUrl(absUrl(img, 'https://www.uhdfc.com/')) : '',
      source_name: '울산 HD (프리뷰·리뷰)',
      source_url: `https://www.uhdfc.com/board/board_view.php?no_seq=${id}&buid=presskits`,
      published_at: null, category: '경기',
    })
  }
  return out
}
const ulsanProvider: ClubProvider = {
  clubId: 'ulsan', clubName: '울산 HD',
  allowedHosts: ['www.uhdfc.com'],
  async collect() {
    // 2개 소스 각각 실패 격리 후 인터리브(둘 다 노출되도록 번갈아 합침).
    const parts = await Promise.allSettled([ulsanNewsBoard(), ulsanPressBoard()])
    const a = parts[0].status === 'fulfilled' ? parts[0].value : []
    const b = parts[1].status === 'fulfilled' ? parts[1].value : []
    const merged: CollectedItem[] = []
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) merged.push(a[i]); if (b[i]) merged.push(b[i])
    }
    if (!merged.length) throw new Error('empty_list')
    return merged.slice(0, MAX_COLLECT_ITEMS)
  },
}
async function ulsanDetail(sid: string): Promise<DetailResult> {
  const [buid, id] = sid.split(':')
  const html = await collectFetch(`https://www.uhdfc.com/board/board_view.php?no_seq=${id}&buid=${buid}`, ulsanProvider.allowedHosts)
  // 본문은 .txt_area(에디터 영역)에 있다(.board_view 는 제목/메타 래퍼).
  const block = sliceBlock(html, /<div class="txt_area"[^>]*>/i, [/<div class="board_(?:view_bottom|reply|btn|share|list)/i])
  const d = html.match(/작성일[\s\S]{0,40}?(20\d{2}-\d{1,2}-\d{1,2})/)?.[1] || ''
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://www.uhdfc.com/')), date: isoDate(d) }
}

// ── Provider: 포항 스틸러스 ──
// 레거시 notice_list API 는 2020 아카이브로 고정 → 사용 불가. 공식 페이지 SSR 의 최신
// feedBox(data-feed=카테고리, data-link=notice_detail?id=) 를 수집(사이트가 노출하는 최신분).
const pohangProvider: ClubProvider = {
  clubId: 'pohang', clubName: '포항 스틸러스',
  allowedHosts: ['www.steelers.co.kr'],
  async collect() {
    const html = await collectFetch('https://www.steelers.co.kr/board/notice?to=notice', this.allowedHosts)
    const out: CollectedItem[] = []
    const seen = new Set<string>()
    const re = /data-feed="([^"]*)"\s+data-link="\/board\/notice_detail\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const feed = m[1], id = m[2], inner = m[3]
      if (seen.has(id)) continue
      seen.add(id)
      const title = clean(inner.match(/<p class="title">([\s\S]*?)<\/p>/i)?.[1] || '', 300)
      if (!title) continue
      const bg = inner.match(/url\((?:&quot;|["'])?([^)"'&]+)/i)?.[1] || ''
      const cat = /보도/.test(feed) ? '경기' : '구단 공지'
      out.push({
        team_id: 'pohang', source_article_id: id, title, content: '', excerpt: '',
        image_url: bg ? safeUrl(bg) : '',
        source_name: /보도/.test(feed) ? '포항 스틸러스 (보도자료)' : '포항 스틸러스',
        source_url: `https://www.steelers.co.kr/board/notice_detail?id=${id}`,
        published_at: null, category: cat,
      })
    }
    if (!out.length) throw new Error('empty_list')
    return out
  },
}
async function pohangDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://www.steelers.co.kr/board/notice_detail?id=${id}`, pohangProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="contBox whiteType"[^>]*>/i, [/<div class="(?:contBtm|listBtn|prevNext|reply)/i])
  // 작성일 라벨과 날짜 사이에 태그가 있으므로 태그 허용 매칭.
  const d = html.match(/작성일[\s\S]{0,60}?(20\d{2}[.-]\d{1,2}[.-]\d{1,2})/)?.[1] || ''
  return { content: htmlToParagraphs(block), image: safeUrl(firstImg(block)), date: isoDate(d) }
}

// ── Provider: 대전 하나 시티즌 (서버렌더 HTML — bd_l/bd_v, 김천과 유사하나 selector 상이) ──
const daejeonProvider: ClubProvider = {
  clubId: 'daejeon', clubName: '대전하나시티즌',
  allowedHosts: ['www.dhcfc.kr'],
  async collect() {
    const html = await collectFetch('https://www.dhcfc.kr/bd/bd_l.php?buid=g_news', this.allowedHosts)
    const out: CollectedItem[] = []
    const seen = new Set<string>()
    const re = /<a href="\/bd\/bd_v\.php\?buid=g_news&(?:amp;)?no_seq=(\d+)">([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const id = m[1], inner = m[2]
      if (seen.has(id)) continue
      const title = clean(inner.match(/<div class="txt">([\s\S]*?)<\/div>/i)?.[1] || '', 300)
      if (!title) continue
      seen.add(id)
      const img = inner.match(/<img src="([^"]+)"/i)?.[1] || ''
      out.push({
        team_id: 'daejeon', source_article_id: id, title, content: '', excerpt: '',
        image_url: img ? safeUrl(absUrl(img, 'https://www.dhcfc.kr/')) : '',
        source_name: '대전하나시티즌',
        source_url: `https://www.dhcfc.kr/bd/bd_v.php?buid=g_news&no_seq=${id}`,
        published_at: null, category: categorize(title),
      })
    }
    if (!out.length) throw new Error('empty_list')
    return out
  },
}
async function daejeonDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://www.dhcfc.kr/bd/bd_v.php?buid=g_news&no_seq=${id}`, daejeonProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="bd_v_cont"[^>]*>/i, [/<div class="bd_v_(?:file|btn|move)/i])
  // 날짜는 .bd_v_info 의 .right(작성자 다음)에 있다 → 첫 </div> 로 자르지 말고 넓게 슬라이스.
  const info = sliceBlock(html, /<div class="bd_v_info"[^>]*>/i, [/<div class="bd_v_cont"/i], 600)
  const d = info.match(/20\d{2}[.-]\d{1,2}[.-]\d{1,2}/)?.[0] || ''
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://www.dhcfc.kr/')), date: isoDate(d) }
}

// ── Provider: 강원FC (서버렌더 HTML — /news 목록에 img/제목/날짜, 상세 /news/:id) ──
const gangwonProvider: ClubProvider = {
  clubId: 'gangwon', clubName: '강원FC',
  allowedHosts: ['gangwon-fc.com'],
  async collect() {
    const html = await collectFetch('https://gangwon-fc.com/news', this.allowedHosts)
    const out: CollectedItem[] = []
    const re = /<div class="item">\s*<a href="\/news\/(\d+)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<p class="subject[^"]*">([\s\S]*?)<\/p>[\s\S]*?<span class="date">([^<]+)<\/span>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const id = m[1], img = m[2], title = clean(m[3], 300), date = m[4].trim()
      if (!title) continue
      out.push({
        team_id: 'gangwon', source_article_id: id, title, content: '', excerpt: '',
        image_url: img ? safeUrl(absUrl(img, 'https://gangwon-fc.com/')) : '',
        source_name: '강원FC', source_url: `https://gangwon-fc.com/news/${id}`,
        published_at: isoDate(date), category: categorize(title),
      })
    }
    if (!out.length) throw new Error('empty_list')
    return out
  },
}
async function gangwonDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://gangwon-fc.com/news/${id}`, gangwonProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="boardView"[^>]*>/i, [/<span class="viewmore"|<div class="board(?:Btn|List)|<div class="prevNext"/i])
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://gangwon-fc.com/')) }
}

// ── Provider: 제주 SK FC (서버렌더 HTML — 목록 table tr onclick bbsSn, 상세 oldImage) ──
const jejuProvider: ClubProvider = {
  clubId: 'jeju', clubName: '제주SK FC',
  allowedHosts: ['www.jejuskfc.com'],
  async collect() {
    const html = await collectFetch('https://www.jejuskfc.com/board/news/list', this.allowedHosts)
    const out: CollectedItem[] = []
    const re = /<tr onclick="location\.href=[^"]*bbsSn=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const id = m[1], inner = m[2]
      const title = clean(inner.match(/<div class="subjectWrap">\s*<p>([\s\S]*?)<\/p>/i)?.[1] || '', 300)
      if (!title) continue
      const date = inner.match(/<td>(\d{4}-\d{2}-\d{2})<\/td>/i)?.[1] || ''
      out.push({
        team_id: 'jeju', source_article_id: id, title, content: '', excerpt: '',
        image_url: '', source_name: '제주SK FC',
        source_url: `https://www.jejuskfc.com/board/news/detail?bbsSn=${id}`,
        published_at: isoDate(date), category: categorize(title),
      })
    }
    if (!out.length) throw new Error('empty_list')
    return out
  },
}
async function jejuDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://www.jejuskfc.com/board/news/detail?bbsSn=${id}`, jejuProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="oldImage"[^>]*>/i, [/<div class="(?:detail_close|views|btnArea|paging)/i])
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://www.jejuskfc.com/')) }
}

// ── Provider: FC안양 (ASP — 목록 goDetail(seq)+제목, 상세 newsDetail.asp view_data) ──
const anyangProvider: ClubProvider = {
  clubId: 'anyang', clubName: 'FC안양',
  allowedHosts: ['www.fc-anyang.com'],
  async collect() {
    const html = await collectFetch('https://www.fc-anyang.com/news/news.asp?menu=TNews', this.allowedHosts)
    const out: CollectedItem[] = []
    const seen = new Set<string>()
    const re = /goDetail\((\d+)\)[^>]*>([\s\S]{0,220}?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const id = m[1], title = clean(m[2], 300)
      if (!title || seen.has(id)) continue
      seen.add(id)
      out.push({
        team_id: 'anyang', source_article_id: id, title, content: '', excerpt: '',
        image_url: '', source_name: 'FC안양',
        source_url: `https://www.fc-anyang.com/news/newsDetail.asp?menu=TNews&seq=${id}`,
        published_at: null, category: categorize(title),
      })
    }
    if (!out.length) throw new Error('empty_list')
    return out
  },
}
async function anyangDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://www.fc-anyang.com/news/newsDetail.asp?menu=TNews&seq=${id}`, anyangProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="view_data"[^>]*>/i, [/<div class="btn_center"|<div class="submenu"/i])
  const d = sliceBlock(html, /<div class="sub_content"[^>]*>/i, [], 1500).match(/20\d{2}[-.]\d{1,2}[-.]\d{1,2}/)?.[0] || ''
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://www.fc-anyang.com/')), date: isoDate(d) }
}

// ── Provider: 인천 유나이티드 (서버렌더 HTML — feedBox feeds_view?idx, 상세 boardView) ──
const incheonProvider: ClubProvider = {
  clubId: 'incheon', clubName: '인천 유나이티드',
  allowedHosts: ['www.incheonutd.com'],
  async collect() {
    const html = await collectFetch('https://www.incheonutd.com/fanzone/feeds_news.php', this.allowedHosts)
    const out: CollectedItem[] = []
    const re = /<div class="feedBox" data-feeds="news">\s*<a href="[^"]*feeds_view\.php\?idx=(\d+)[^"]*">([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < MAX_COLLECT_ITEMS) {
      const id = m[1], inner = m[2]
      const title = clean(inner.match(/<p class="subject">([\s\S]*?)<\/p>/i)?.[1] || '', 300)
      if (!title) continue
      const img = inner.match(/<img src="([^"]+)"/i)?.[1] || ''
      out.push({
        team_id: 'incheon', source_article_id: id, title, content: '', excerpt: '',
        image_url: img ? safeUrl(absUrl(img, 'https://www.incheonutd.com/')) : '',
        source_name: '인천 유나이티드',
        source_url: `https://www.incheonutd.com/fanzone/feeds_view.php?idx=${id}&tgbn=feeds_news`,
        published_at: null, category: categorize(title),
      })
    }
    if (!out.length) throw new Error('empty_list')
    return out
  },
}
async function incheonDetail(id: string): Promise<DetailResult> {
  const html = await collectFetch(`https://www.incheonutd.com/fanzone/feeds_view.php?idx=${id}&tgbn=feeds_news`, incheonProvider.allowedHosts)
  const block = sliceBlock(html, /<div class="boardView"[^>]*>/i, [/<div class="(?:boardBtn|boardList|reply|paging)/i])
  const head = block.slice(0, 400)
  const d = head.match(/20\d{2}[-.]\d{1,2}[-.]\d{1,2}/)?.[0] || ''
  return { content: htmlToParagraphs(block), image: safeUrl(absUrl(firstImg(block), 'https://www.incheonutd.com/')), date: isoDate(d) }
}

// ── Provider: 부천FC1995 (SPA — 공개 JSON API clubNewsList + clubNews/{seq}/detail) ──
const bucheonProvider: ClubProvider = {
  clubId: 'bucheon', clubName: '부천FC1995',
  allowedHosts: ['bfc1995.com'],
  async collect() {
    const raw = await collectFetch('https://bfc1995.com/api/media/clubNewsList?page=1', this.allowedHosts, true)
    const data = JSON.parse(raw)?.data
    const list = (Array.isArray(data) ? data : (data?.list || [])).slice(0, MAX_COLLECT_ITEMS)
    const out: CollectedItem[] = []
    for (const it of list) {
      const seq = String(it.seq || '')
      const title = decodeEntities(String(it.Title || '')).trim()
      if (!seq || !title) continue
      out.push({
        team_id: 'bucheon', source_article_id: seq, title: title.slice(0, 300),
        content: '', excerpt: '',
        image_url: /^https?:\/\//.test(String(it.TopImage || '')) ? safeUrl(String(it.TopImage)) : '',
        source_name: '부천FC1995',
        source_url: `https://bfc1995.com/media/clubNews/${seq}`,
        published_at: isoDate(String(it.regDate || '').replace(/-/g, '.'), String(it.regDate || '').slice(11)),
        category: categorize(title),
      })
    }
    return out
  },
}
async function bucheonDetail(seq: string): Promise<DetailResult> {
  const raw = await collectFetch(`https://bfc1995.com/api/media/clubNews/${seq}/detail`, bucheonProvider.allowedHosts, true)
  const cur = JSON.parse(raw)?.data?.current
  const html = String(cur?.Content || '')
  const img = firstImg(html)
  return { content: htmlToParagraphs(html), image: img ? safeUrl(/^https?:\/\//.test(img) ? img : absUrl(img, 'https://bfc1995.com/')) : '' }
}

// 활성 Provider 레지스트리 — 실측 조사에서 목록/상세 파싱이 검증된 12개 구단.
const CLUB_PROVIDERS: ClubProvider[] = [
  jeonbukProvider, gimcheonProvider, gwangjuProvider,
  seoulProvider, ulsanProvider, pohangProvider, daejeonProvider,
  gangwonProvider, jejuProvider, anyangProvider, incheonProvider, bucheonProvider,
]
const DETAIL_FETCHERS: Record<string, (id: string) => Promise<DetailResult>> = {
  jeonbuk: jeonbukDetail, gimcheon: gimcheonDetail, gwangju: gwangjuDetail,
  seoul: seoulDetail, ulsan: ulsanDetail, pohang: pohangDetail, daejeon: daejeonDetail,
  gangwon: gangwonDetail, jeju: jejuDetail, anyang: anyangDetail, incheon: incheonDetail, bucheon: bucheonDetail,
}

// 한 구단 수집 → team_news upsert. 반환: { collected, inserted, updated }
async function collectClub(admin: ReturnType<typeof createClient>, p: ClubProvider) {
  const items = await p.collect()
  if (!items.length) throw new Error('empty_list')

  // 기존 기사 조회(신규 판별 → 상세 fetch 최소화). 본문이 없는 기존 행(제목 폴백)은
  // 상세를 재시도한다(이전 실행에서 상한/일시 오류로 본문을 못 받은 경우 복구).
  const ids = items.map(i => i.source_article_id)
  const { data: existing } = await admin.from('team_news')
    .select('source_article_id, title, content')
    .eq('team_id', p.clubId).in('source_article_id', ids)
  const known = new Map((existing || []).map((r: { source_article_id: string; title: string; content: string }) =>
    [r.source_article_id, (r.content || '').length > (r.title || '').length + 30]))  // true = 실본문 보유

  // 신규/본문누락 기사만 상세 본문 fetch(실행당 상한 + 요청 간 짧은 지연 — 원 사이트 보호)
  let detailFetched = 0
  const detailErrors: string[] = []
  const fetcher = DETAIL_FETCHERS[p.clubId]
  for (const it of items) {
    if (it.content) continue                               // Provider 가 이미 본문 확보(예: inline)
    if (known.get(it.source_article_id) === true) continue // 실본문 이미 보유 → skip
    if (!fetcher) continue                                 // 상세 fetcher 없음(목록 메타만)
    if (detailFetched >= MAX_DETAIL_FETCH) break
    try {
      const d = await fetcher(it.source_article_id)
      if (typeof d === 'string') it.content = d
      else {
        it.content = d.content
        if (!it.image_url && d.image) it.image_url = d.image
        if (!it.published_at && d.date) it.published_at = d.date  // 목록에 날짜 없으면 상세에서 보강
      }
      if (!it.content) detailErrors.push(`${it.source_article_id}:empty`)
      detailFetched++
      await new Promise(r => setTimeout(r, 400))
    } catch (e) {
      // 상세 실패 → 목록 메타만 저장(본문은 다음 실행에서 재시도 가능). 오류는 관측용 수집.
      detailErrors.push(`${it.source_article_id}:${String((e as Error)?.message || e).slice(0, 60)}`)
    }
  }

  // 원자적 upsert (UNIQUE team_id+source_article_id) — 동시 실행/retry 에도 중복 0
  const now = new Date().toISOString()
  const rows = items.map(it => {
    const hash = contentHash(it.title + '|' + it.content)
    return {
      team_id: it.team_id, source_article_id: it.source_article_id,
      title: it.title, content: it.content || it.excerpt || it.title,
      excerpt: it.excerpt || (it.content ? it.content.split('\n')[0].slice(0, 200) : ''),
      image_url: it.image_url || null,
      source_name: it.source_name, source_url: it.source_url,
      published_at: it.published_at, content_hash: hash,
      category: it.category, origin: 'collected', status: 'published', updated_at: now,
    }
  })
  // 실본문을 이미 보유한 기존 행을 이번에 content 없이(상세 skip) 목록 메타로
  // 덮어쓰지 않도록, "실본문 보유 + 이번 content 없음" 조합은 제외.
  const gotContent = new Set(items.filter(i => i.content).map(i => i.source_article_id))
  const toWrite = rows.filter(r => !(known.get(r.source_article_id) === true && !gotContent.has(r.source_article_id)))
  const { error } = await admin.from('team_news')
    .upsert(toWrite, { onConflict: 'team_id,source_article_id' })
  if (error) throw new Error(`upsert:${error.message}`)
  return { collected: items.length, written: toWrite.length, newDetail: detailFetched, detailErrors: detailErrors.slice(0, 5) }
}

// collect 액션 전체 오케스트레이션(구단별 실패 격리).
// ⚠️ 순차 실행: 스테이징 실측에서 3개 구단 병렬 실행 시 상세 fetch 가 빈 응답으로
//    조용히 실패하는 사례가 재현됨(Edge 동시 outbound 부하). 수집은 백그라운드
//    스케줄 작업이라 지연이 무해하므로 순차가 안전하다. 실패는 구단별로 격리된다.
async function runCollect(admin: ReturnType<typeof createClient>, only: string[] | null) {
  const targets = CLUB_PROVIDERS.filter(p => !only || only.includes(p.clubId))
  const out: Array<Record<string, unknown>> = []
  for (const p of targets) {
    try {
      const r = await collectClub(admin, p)
      await recordCollectHealth(admin, p.clubId, true, r.collected, null)
      out.push({ clubId: p.clubId, ok: true, ...r })
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 200)
      await recordCollectHealth(admin, p.clubId, false, 0, msg)
      out.push({ clubId: p.clubId, ok: false, error: msg })
    }
  }
  return out
}

async function recordCollectHealth(
  admin: ReturnType<typeof createClient>, clubId: string, ok: boolean, count: number, error: string | null,
) {
  try {
    const now = new Date().toISOString()
    const { data: cur } = await admin.from('news_sources').select('consecutive_failures').eq('club_id', clubId).maybeSingle()
    const patch: Record<string, unknown> = { club_id: clubId, updated_at: now }
    if (ok) { patch.last_success_at = now; patch.consecutive_failures = 0; patch.last_error = null; patch.last_collected_count = count }
    else { patch.last_failure_at = now; patch.consecutive_failures = (cur?.consecutive_failures || 0) + 1; patch.last_error = error }
    await admin.from('news_sources').upsert(patch)
  } catch { /* 헬스 기록 실패는 수집을 막지 않음 */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const body = await req.json().catch(() => ({}))

  // ── action='collect': 공식 뉴스 → team_news 영속 수집 (cron/관리자 전용) ──
  if (body.action === 'collect') {
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    // service_role 판정: env 문자열 일치(legacy) 또는 JWT role claim(플랫폼 verify_jwt 가
    // 서명을 이미 검증했으므로 payload 의 role 확인으로 충분. 키 회전에도 안전).
    let authorized = bearer === SERVICE_ROLE
    if (!authorized && bearer.split('.').length === 3) {
      try {
        const payload = JSON.parse(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        authorized = payload?.role === 'service_role'
      } catch { /* not a JWT */ }
    }
    if (!authorized) {
      // 사용자 JWT 인 경우 관리자만 허용
      const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
      const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${bearer}` } } })
      const { data: { user } } = await caller.auth.getUser()
      if (user) {
        const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
        authorized = ['admin', 'superadmin', 'staff'].includes(prof?.role || '')
      }
    }
    if (!authorized) return json({ ok: false, error: 'forbidden' }, 403)

    const only = Array.isArray(body.clubs) && body.clubs.length ? body.clubs.map(String) : null
    const results = await runCollect(admin, only)
    return json({ ok: true, results })
  }
  const clubId = String(body.clubId || '').trim()
  const clubName = String(body.clubName || '')
  const rssUrl = body.rssUrl ? String(body.rssUrl) : ''
  // 복수 뉴스 URL 지원(newsUrls 배열) + 단일(newsUrl) 하위호환.
  const newsUrls: string[] = Array.isArray(body.newsUrls)
    ? body.newsUrls.map((u: unknown) => String(u)).filter(Boolean)
    : (body.newsUrl ? [String(body.newsUrl)] : [])
  const force = !!body.force   // 연결 테스트 등: 캐시 무시하고 즉시 수집
  if (!clubId) return json({ ok: false, error: 'no_club', items: [] })

  // 1) 캐시 확인 (force 면 건너뜀)
  const { data: cached } = await admin.from('news_cache').select('*').eq('club_id', clubId).maybeSingle()
  if (!force && cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MIN * 60000) {
    return json({ ok: true, items: cached.items || [], source: 'cache', cachedAt: cached.fetched_at })
  }

  // 2) 실제 수집: RSS 우선 → 뉴스 URL(복수)을 순서대로 스크래핑
  let items: Record<string, unknown>[] = []
  let source = 'empty'
  let errorReason = ''
  try {
    if (rssUrl) {
      const xml = await fetchText(rssUrl)
      items = parseFeed(xml).slice(0, MAX_ITEMS).map(r => toStandard(r, clubId, clubName))
      if (items.length) source = 'rss'
    }
    for (const url of newsUrls) {
      if (items.length) break
      try {
        const html = await fetchText(url)
        items = scrapeOfficial(html, url).slice(0, MAX_ITEMS).map(r => toStandard(r, clubId, clubName))
        if (items.length) source = 'official'
      } catch (e) { errorReason = String((e as Error)?.message || e) }
    }
  } catch (e) {
    errorReason = String((e as Error)?.message || e)
    await recordStatus(admin, clubId, clubName, false, 0, errorReason || 'fetch_error')
    if (cached?.items?.length) return json({ ok: true, items: cached.items, source: 'stale', cachedAt: cached.fetched_at })
    return json({ ok: false, code: 'error', items: [], source: 'error' })
  }

  // 3) 성공 시 캐시 갱신 + 상태 기록. 실패면 상태 기록 후 stale/empty 폴백.
  const now = new Date().toISOString()
  if (items.length) {
    await admin.from('news_cache').upsert({ club_id: clubId, items, source, fetched_at: now })
    await recordStatus(admin, clubId, clubName, true, items.length, null)
    return json({ ok: true, items, source, count: items.length, cachedAt: now })
  }
  await recordStatus(admin, clubId, clubName, false, 0, errorReason || 'empty')
  if (cached?.items?.length) return json({ ok: true, items: cached.items, source: 'stale', cachedAt: cached.fetched_at })
  return json({ ok: false, code: 'empty', items: [], source: 'empty' })
})

// news_sources 상태 기록 + 실패 임계(3회) 시 관리자 알림. news_sources 테이블(0021)이
// 없으면 조용히 무시(뉴스 흐름은 계속). service_role 로 실행되므로 RLS 우회.
const FAILURE_THRESHOLD = 3
async function recordStatus(
  admin: ReturnType<typeof createClient>,
  clubId: string, clubName: string, ok: boolean, count: number, error: string | null,
) {
  try {
    const now = new Date().toISOString()
    const { data: cur } = await admin.from('news_sources').select('failure_count,alerted_at').eq('club_id', clubId).maybeSingle()
    const failureCount = ok ? 0 : (cur?.failure_count || 0) + 1
    const patch: Record<string, unknown> = { club_id: clubId, updated_at: now }
    if (ok) { patch.last_success_at = now; patch.failure_count = 0; patch.alerted_at = null; patch.last_error = null }
    else { patch.last_failure_at = now; patch.failure_count = failureCount; patch.last_error = error }
    await admin.from('news_sources').upsert(patch)

    if (!ok && failureCount >= FAILURE_THRESHOLD && !cur?.alerted_at) {
      const { data: admins } = await admin.from('profiles').select('id').in('role', ['admin', 'superadmin', 'staff'])
      const rows = (admins || []).map((a: { id: string }) => ({
        user_id: a.id, type: 'notice', title: '뉴스 연결 실패',
        body: `${clubName || clubId} 뉴스 연결 실패 ${failureCount}회`, is_read: false,
      }))
      if (rows.length) await admin.from('notifications').insert(rows)
      await admin.from('news_sources').update({ alerted_at: now }).eq('club_id', clubId)
    }
  } catch (_e) { /* news_sources 미마이그레이션 등 → 무시 */ }
}
