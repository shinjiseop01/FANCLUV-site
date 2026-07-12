// FANCLUV — 장애 알림 디스패처 (Supabase Edge Function, Deno).
//
// 장애/이상 상황을 여러 채널로 fan-out 한다. 각 채널은 해당 secret 이 있을 때만 발송하고,
// 없으면 'skipped'(unconfigured) 로 정직하게 보고한다. 비밀키는 응답에 절대 노출하지 않는다.
//   - admin_notification: 관리자 프로필에게 in-app 알림(notifications) — 항상.
//   - slack:   SLACK_WEBHOOK_URL
//   - discord: DISCORD_WEBHOOK_URL
//   - email:   RESEND_API_KEY + ALERT_EMAIL_TO (+ ALERT_EMAIL_FROM)
//
// 호출: 관리자 JWT 또는 service_role. body: { level, title, body, url? }
// 응답: { ok, channels: { [name]: 'sent'|'skipped'|'error', detail? } }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SLACK = Deno.env.get('SLACK_WEBHOOK_URL')
  const DISCORD = Deno.env.get('DISCORD_WEBHOOK_URL')
  const RESEND = Deno.env.get('RESEND_API_KEY')
  const EMAIL_TO = Deno.env.get('ALERT_EMAIL_TO')
  const EMAIL_FROM = Deno.env.get('ALERT_EMAIL_FROM') || 'FANCLUV Alerts <alerts@fancluv.app>'

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // 인증: 관리자 JWT 또는 service_role 키 직접 호출.
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  let authorized = token === SERVICE_ROLE
  if (!authorized && token) {
    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await caller.auth.getUser()
    if (user) {
      const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
      authorized = ['admin', 'superadmin', 'staff'].includes(prof?.role)
    }
  }
  if (!authorized) return json({ ok: false, code: 'forbidden' }, 403)

  const { level = 'critical', title = 'FANCLUV 장애', body = '', url = null, dryRun = false } =
    await req.json().catch(() => ({}))
  const text = `[${String(level).toUpperCase()}] ${title}\n${body}${url ? `\n${url}` : ''}`
  const channels: Record<string, string> = {}
  const detail: Record<string, string> = {}

  // 1) 관리자 in-app 알림(항상) + 중복 방지.
  //    notifications 의 dedup 인덱스는 부분 유니크(where dedup_key is not null)라 upsert onConflict
  //    추론이 불가(42P10)하므로, dedup_key 로 기존 수신자를 사전 조회해 미수신자에게만 insert 한다.
  //    dedup_key = alert:<title>:<분 단위 버킷> → 같은 알림이 1분 내 반복돼도 중복 생성 안 됨.
  try {
    const { data: admins } = await admin.from('profiles').select('id').in('role', ['admin', 'superadmin', 'staff'])
    const bucket = new Date().toISOString().slice(0, 16) // 분 단위
    const dedupKey = `alert:${title}:${bucket}`
    const { data: existing } = await admin.from('notifications').select('user_id').eq('dedup_key', dedupKey)
    const already = new Set((existing || []).map((r: { user_id: string }) => r.user_id))
    const rows = (admins || []).filter((a: { id: string }) => !already.has(a.id)).map((a: { id: string }) => ({
      user_id: a.id, type: 'system', title: `🚨 ${title}`, body, url, is_important: true, dedup_key: dedupKey,
    }))
    if (!dryRun && rows.length) {
      const { error } = await admin.from('notifications').insert(rows)
      if (error) throw error
    }
    channels.admin_notification = rows.length ? (dryRun ? 'skipped' : 'sent') : 'skipped'
    detail.admin_notification = `${rows.length} new / ${already.size} deduped`
  } catch (e) { channels.admin_notification = 'error'; detail.admin_notification = String((e as Error)?.message || e) }

  // 2) Slack
  if (!SLACK) channels.slack = 'skipped'
  else {
    try {
      const r = await fetch(SLACK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      channels.slack = r.ok ? 'sent' : 'error'; if (!r.ok) detail.slack = `http_${r.status}`
    } catch (e) { channels.slack = 'error'; detail.slack = String((e as Error)?.message || e) }
  }

  // 3) Discord
  if (!DISCORD) channels.discord = 'skipped'
  else {
    try {
      const r = await fetch(DISCORD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) })
      channels.discord = (r.ok || r.status === 204) ? 'sent' : 'error'; if (!r.ok && r.status !== 204) detail.discord = `http_${r.status}`
    } catch (e) { channels.discord = 'error'; detail.discord = String((e as Error)?.message || e) }
  }

  // 4) Email (Resend)
  if (!RESEND || !EMAIL_TO) channels.email = 'skipped'
  else {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: EMAIL_TO.split(','), subject: `🚨 ${title}`, text }),
      })
      channels.email = r.ok ? 'sent' : 'error'; if (!r.ok) detail.email = `http_${r.status}`
    } catch (e) { channels.email = 'error'; detail.email = String((e as Error)?.message || e) }
  }

  return json({ ok: true, level, channels, detail })
})
