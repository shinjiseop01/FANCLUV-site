// FANCLUV — FC안양 공식 뉴스 수집기 (Vercel Node Serverless Function).
//
// 왜 별도 Node collector 인가:
//   FC안양 공식 서버(www.fc-anyang.com)는 TLS 키교환으로 정적 RSA 스위트
//   (TLS_RSA_WITH_AES_256_GCM_SHA384)만 제공하고 ECDHE(전방향 보안) 스위트를
//   지원하지 않는다. Supabase Edge(Deno/rustls)는 비-PFS RSA-kx 스위트를 거부하여
//   HandshakeFailure 로 실패한다. Node(OpenSSL)는 동일 스위트를 정상 지원하므로
//   TLS 인증서 검증을 유지한 채 접속 가능하다(검증 우회 없음).
//
//   → 나머지 11개 구단: Supabase news-fetcher(Edge)
//   → FC안양: 이 Node collector (Vercel)
//   최종 저장은 동일한 team_news(origin='collected') — 프런트는 구단을 구분하지 않는다.
//
// 보안:
//   - POST + Authorization: Bearer <NEWS_COLLECTOR_SECRET> (서버 전용 시크릿) 필수.
//   - 수집 URL 은 코드 고정 allowlist(www.fc-anyang.com) — 요청 파라미터로 URL 주입 불가(SSRF 차단).
//   - service_role 키는 서버 env 로만 사용(클라이언트 번들 비노출).
//   - TLS 인증서 검증 ON(rejectUnauthorized 기본값 유지).
//
// DB 접근은 supabase-js 대신 PostgREST REST(fetch)로 직접 호출한다 — realtime/WebSocket
// 의존을 제거해 Node 20 서버리스에서도 안정 동작(불필요한 종속성 회피).
import https from 'node:https'

const ALLOWED_HOST = 'www.fc-anyang.com'
const LIST_URL = 'https://www.fc-anyang.com/news/news.asp?menu=TNews'
const DETAIL_URL = (seq) => `https://www.fc-anyang.com/news/newsDetail.asp?menu=TNews&seq=${seq}`
const UA = 'Mozilla/5.0 (compatible; FANCLUV-NewsBot/1.0; +https://fancluv.com)'
const FETCH_TIMEOUT_MS = 12000
const MAX_ITEMS = 10
const MAX_DETAIL = 8

// ── Node HTTPS GET (OpenSSL, TLS 검증 ON). host allowlist 강제(SSRF 방어). ──
function httpsGet(url) {
  const u = new URL(url)
  if (u.hostname !== ALLOWED_HOST) return Promise.reject(new Error(`host_not_allowed:${u.hostname}`))
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      timeout: FETCH_TIMEOUT_MS,
      // rejectUnauthorized 기본 true — 인증서 검증 유지(우회 없음).
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`http_${res.statusCode}`)) }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (d) => { data += d })
      res.on('end', () => resolve(data))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

// ── 정규화/새니타이즈 헬퍼(Edge news-fetcher 와 동일 정책) ──
function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' ') }
// FC안양 ASP 사이트는 엔티티 뒤 세미콜론(;)을 종종 생략한다(&nbsp, &iuml 등) → 선택적 ; 허용.
const NAMED_ENTITIES = {
  lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', bull: '•',
  ndash: '–', mdash: '—', times: '×', reg: '®', copy: '©', trade: '™', deg: '°',
  // Latin-1 강세 문자(외국 선수명 등)
  iuml: 'ï', euml: 'ë', ouml: 'ö', uuml: 'ü', auml: 'ä', aacute: 'á', eacute: 'é',
  iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', egrave: 'è', ograve: 'ò',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', ccedil: 'ç', ntilde: 'ñ', szlig: 'ß', oslash: 'ø', aring: 'å',
}
// 세미콜론 없는 레거시 엔티티는 "알려진 이름 중 최장 일치"로 처리해야 한다
// (예: &iumlc → ï + c). 알려진 이름을 길이 내림차순 alternation 으로 매칭.
const ENTITY_NAMES_RE = Object.keys(NAMED_ENTITIES).filter((k) => k !== 'amp')
  .sort((a, b) => b.length - a.length).join('|')
const NAMED_RE = new RegExp(`&(${ENTITY_NAMES_RE});?`, 'gi')
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(NAMED_RE, (_, name) => NAMED_ENTITIES[name.toLowerCase()])
    .replace(/&amp;?/g, '&')
}
export function htmlToParagraphs(html) {
  let s = String(html || '')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  for (let i = 0; i < 2; i++) {
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    s = stripTags(s)
    const dec = decodeEntities(s)
    if (dec === s) break
    s = dec
  }
  s = s.replace(/<[^>]*>/g, ' ').replace(/<[a-zA-Z/!][^<]*$/, ' ')
  const paras = s.split(/\n+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length > 1)
  return paras.join('\n\n').slice(0, 20000)
}
function clean(s, max = 300) {
  const out = decodeEntities(stripTags(String(s || ''))).replace(/\s+/g, ' ').trim()
  return out.length > max ? out.slice(0, max - 1) + '…' : out
}
function sliceBlock(html, startRe, endRes = [], max = 16000) {
  const m = html.match(startRe)
  if (!m || m.index == null) return ''
  const from = m.index + m[0].length
  const seg = html.slice(from, from + max)
  let cut = seg.length
  for (const er of endRes) { const e = seg.search(er); if (e >= 0 && e < cut) cut = e }
  return seg.slice(0, cut)
}
function firstImg(block) {
  const re = /<img[^>]+(?:data-src|src)=["']([^"']+\.(?:jpe?g|png|webp|gif)[^"']*)["']/gi
  let m
  while ((m = re.exec(block))) { if (!/logo|icon|blank|spacer|btn_|sns|footer|common\//i.test(m[1])) return m[1] }
  return ''
}
function absUrl(href, base) { try { return new URL(href, base).href } catch { return '' } }
function safeUrl(u) { const s = String(u || ''); if (!s) return ''; try { return /%[0-9a-fA-F]{2}/.test(s) ? s : encodeURI(s) } catch { return s } }
function categorize(title) {
  const t = String(title || '')
  if (/이적|영입|계약|임대|완전\s*이적|재계약/.test(t)) return '이적'
  if (/인터뷰|일문일답|미디어데이/.test(t)) return '인터뷰'
  if (/프리뷰|리뷰|경기|매치|라운드|승리|무승부|역전|결승|선제골|데뷔골/.test(t)) return '경기'
  if (/이벤트|팬\s*사인|행사|할인|증정|프로모션|팬미팅/.test(t)) return '이벤트'
  if (/선수단|선수|부상|복귀|명단|소집|승선|콜업/.test(t)) return '선수'
  return '구단 공지'
}
function isoDate(dateStr) {
  const m = String(dateStr || '').match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/)
  if (!m) return null
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T09:00:00+09:00`
  const d = new Date(iso)
  if (isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000) return null
  return d.toISOString()
}
function contentHash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

// ── FC안양 목록 파서: goDetail(seq) + 제목 ──
export function parseAnyangList(html) {
  const out = []
  const seen = new Set()
  const re = /goDetail\((\d+)\)[^>]*>([\s\S]{0,220}?)<\/a>/gi
  let m
  while ((m = re.exec(html)) && out.length < MAX_ITEMS) {
    const id = m[1]
    const title = clean(m[2], 300)
    if (!title || seen.has(id)) continue
    seen.add(id)
    out.push({
      team_id: 'anyang', source_article_id: id, title, content: '', excerpt: '',
      image_url: '', source_name: 'FC안양',
      source_url: DETAIL_URL(id),
      published_at: null, category: categorize(title),
    })
  }
  return out
}
// ── FC안양 상세 파서: .view_data 본문 + 이미지 + 날짜 ──
export function parseAnyangDetail(html) {
  const block = sliceBlock(html, /<div class="view_data"[^>]*>/i, [/<div class="btn_center"|<div class="submenu"/i])
  const d = (sliceBlock(html, /<div class="sub_content"[^>]*>/i, [], 1500).match(/20\d{2}[-.]\d{1,2}[-.]\d{1,2}/) || [])[0] || ''
  return {
    content: htmlToParagraphs(block),
    image: safeUrl(absUrl(firstImg(block), 'https://www.fc-anyang.com/')),
    date: isoDate(d),
  }
}

// ── PostgREST REST 클라이언트(service_role) — supabase-js/realtime 없이 fetch 직접. ──
export function makeDb(url, key) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  return {
    async select(path) {
      const res = await fetch(`${base}/${path}`, { headers })
      if (!res.ok) throw new Error(`select_${res.status}:${(await res.text()).slice(0, 120)}`)
      return res.json()
    },
    async upsert(table, rows, onConflict) {
      const res = await fetch(`${base}/${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error(`upsert_${res.status}:${(await res.text()).slice(0, 160)}`)
    },
    // INSERT 후 생성 행 반환. 충돌(23505) 시 status 409 → 호출부가 락 판정에 사용.
    async insertReturning(table, row) {
      const res = await fetch(`${base}/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(row),
      })
      if (res.status === 409) return { conflict: true }
      if (!res.ok) throw new Error(`insert_${res.status}:${(await res.text()).slice(0, 160)}`)
      const data = await res.json()
      return { row: Array.isArray(data) ? data[0] : data }
    },
    async patch(table, filter, patch) {
      const res = await fetch(`${base}/${table}?${filter}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`patch_${res.status}:${(await res.text()).slice(0, 160)}`)
    },
  }
}

// ── 수집 오케스트레이션(기존 dedup/upsert 정책 그대로) ──
export async function collectAnyang(db) {
  const listHtml = await httpsGet(LIST_URL)
  const items = parseAnyangList(listHtml)
  if (!items.length) throw new Error('empty_list')

  const ids = items.map((i) => i.source_article_id)
  const inList = `(${ids.join(',')})`
  const existing = await db.select(`team_news?team_id=eq.anyang&source_article_id=in.${inList}&select=source_article_id,title,content`)
  const known = new Map((existing || []).map((r) => [r.source_article_id, (r.content || '').length > (r.title || '').length + 30]))

  let detailFetched = 0
  const detailErrors = []
  for (const it of items) {
    if (known.get(it.source_article_id) === true) continue
    if (detailFetched >= MAX_DETAIL) break
    try {
      const detailHtml = await httpsGet(DETAIL_URL(it.source_article_id))
      const d = parseAnyangDetail(detailHtml)
      it.content = d.content
      if (!it.image_url && d.image) it.image_url = d.image
      if (!it.published_at && d.date) it.published_at = d.date
      if (!it.content) detailErrors.push(`${it.source_article_id}:empty`)
      detailFetched++
      await new Promise((r) => setTimeout(r, 400))
    } catch (e) {
      detailErrors.push(`${it.source_article_id}:${String(e?.message || e).slice(0, 60)}`)
    }
  }

  const now = new Date().toISOString()
  const rows = items.map((it) => ({
    team_id: it.team_id, source_article_id: it.source_article_id,
    title: it.title, content: it.content || it.excerpt || it.title,
    excerpt: it.excerpt || (it.content ? it.content.split('\n')[0].slice(0, 200) : ''),
    image_url: it.image_url || null,
    source_name: it.source_name, source_url: it.source_url,
    published_at: it.published_at, content_hash: contentHash(it.title + '|' + it.content),
    category: it.category, origin: 'collected', status: 'published', updated_at: now,
  }))
  const gotContent = new Set(items.filter((i) => i.content).map((i) => i.source_article_id))
  const toWrite = rows.filter((r) => !(known.get(r.source_article_id) === true && !gotContent.has(r.source_article_id)))
  if (toWrite.length) await db.upsert('team_news', toWrite, 'team_id,source_article_id')
  return { collected: items.length, written: toWrite.length, newDetail: detailFetched, detailErrors: detailErrors.slice(0, 5) }
}

async function recordHealth(db, ok, count, error) {
  try {
    const now = new Date().toISOString()
    const cur = await db.select('news_sources?club_id=eq.anyang&select=consecutive_failures')
    const patch = { club_id: 'anyang', updated_at: now }
    if (ok) { patch.last_success_at = now; patch.consecutive_failures = 0; patch.last_error = null; patch.last_collected_count = count }
    else { patch.last_failure_at = now; patch.consecutive_failures = ((cur && cur[0]?.consecutive_failures) || 0) + 1; patch.last_error = error }
    await db.upsert('news_sources', [patch], 'club_id')
  } catch { /* 헬스 기록 실패는 수집을 막지 않음 */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  // 서버 전용 시크릿 인증(공개 실행 차단).
  const secret = process.env.NEWS_COLLECTOR_SECRET
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!secret || !bearer || bearer !== secret) return res.status(401).json({ ok: false, error: 'unauthorized' })

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  const db = makeDb(url, key)

  try {
    const r = await collectAnyang(db)
    await recordHealth(db, true, r.collected, null)
    return res.status(200).json({ ok: true, clubId: 'anyang', ...r })
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 200)
    await recordHealth(db, false, 0, msg)
    return res.status(200).json({ ok: false, clubId: 'anyang', error: msg })
  }
}
