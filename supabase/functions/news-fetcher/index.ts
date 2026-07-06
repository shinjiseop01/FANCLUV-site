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
// 배포(팀 뉴스 페이지는 로그인 사용자만 접근 → 기본 verify_jwt=true 유지):
//   supabase functions deploy news-fetcher
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 플랫폼 자동 주입)
// 마이그레이션: supabase/migrations/0019_news_cache.sql (news_cache 테이블)
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
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const body = await req.json().catch(() => ({}))
  const clubId = String(body.clubId || '').trim()
  const clubName = String(body.clubName || '')
  const rssUrl = body.rssUrl ? String(body.rssUrl) : ''
  const newsUrl = body.newsUrl ? String(body.newsUrl) : ''
  if (!clubId) return json({ ok: false, error: 'no_club', items: [] })

  // 1) 캐시 확인 (10분 이내면 그대로 반환)
  const { data: cached } = await admin.from('news_cache').select('*').eq('club_id', clubId).maybeSingle()
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MIN * 60000) {
    return json({ ok: true, items: cached.items || [], source: 'cache', cachedAt: cached.fetched_at })
  }

  // 2) 실제 수집: RSS 우선 → 공식 홈페이지 스크래핑
  let items: Record<string, unknown>[] = []
  let source = 'empty'
  try {
    if (rssUrl) {
      const xml = await fetchText(rssUrl)
      items = parseFeed(xml).slice(0, MAX_ITEMS).map(r => toStandard(r, clubId, clubName))
      if (items.length) source = 'rss'
    }
    if (!items.length && newsUrl) {
      const html = await fetchText(newsUrl)
      items = scrapeOfficial(html, newsUrl).slice(0, MAX_ITEMS).map(r => toStandard(r, clubId, clubName))
      if (items.length) source = 'official'
    }
  } catch (_e) {
    // 네트워크/파싱 실패 → 마지막 캐시(있으면 stale 이라도) 반환, 없으면 빈 배열.
    if (cached?.items?.length) return json({ ok: true, items: cached.items, source: 'stale', cachedAt: cached.fetched_at })
    return json({ ok: true, items: [], source: 'error' })
  }

  // 3) 성공 시 캐시 갱신. 결과가 비면 캐시하지 않고(다음에 재시도) 마지막 캐시로 폴백.
  const now = new Date().toISOString()
  if (items.length) {
    await admin.from('news_cache').upsert({ club_id: clubId, items, source, fetched_at: now })
    return json({ ok: true, items, source, cachedAt: now })
  }
  if (cached?.items?.length) return json({ ok: true, items: cached.items, source: 'stale', cachedAt: cached.fetched_at })
  return json({ ok: true, items: [], source: 'empty' })
})
