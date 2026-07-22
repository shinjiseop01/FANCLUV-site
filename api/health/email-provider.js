// Email Provider Health Check — Operational Readiness
// GET /api/health/email-provider
//
// Returns READY/NOT_READY/DEGRADED status without exposing secrets.
// Cached for 30-60s to minimize external API calls.
// Rate limited to prevent abuse.

const CACHE_SECONDS = 45
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60

// In-memory cache for this deployment
let healthCache = null
let cacheExpiry = 0

// Simple in-memory rate limiter by IP
const rateLimitMap = new Map()

// Rate limit middleware
function checkRateLimit(ip) {
  const now = Date.now()
  const key = ip || 'unknown'

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, [])
  }

  const requests = rateLimitMap.get(key)

  // Remove old requests outside the window
  while (requests.length > 0 && requests[0] < now - RATE_LIMIT_WINDOW) {
    requests.shift()
  }

  if (requests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false
  }

  requests.push(now)
  return true
}

// Readiness check logic (safe, no external calls)
function checkReadiness() {
  const resendKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.EMAIL_FROM

  const checks = {
    resendApiKey: !!resendKey,
    emailFromConfigured: !!emailFrom,
    emailFromDomain: null,
  }

  // Validate EMAIL_FROM format and domain
  if (emailFrom) {
    try {
      // Extract domain from "Name <email@domain.com>" format
      const match = emailFrom.match(/<([^>]+)>/) || emailFrom.match(/(\S+@\S+)/)
      if (match) {
        const email = match[1]
        const domain = email.split('@')[1]
        checks.emailFromDomain = domain === 'fancluv.com'
      }
    } catch (_e) {
      checks.emailFromDomain = false
    }
  }

  // READY: all critical checks pass
  if (checks.resendApiKey && checks.emailFromConfigured && checks.emailFromDomain) {
    return {
      ok: true,
      status: 'READY',
      provider: 'resend',
      senderDomainConfigured: true,
      checkedAt: new Date().toISOString(),
    }
  }

  // NOT_READY: missing configuration
  if (!checks.resendApiKey || !checks.emailFromConfigured) {
    return {
      ok: false,
      status: 'NOT_READY',
      reason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      checkedAt: new Date().toISOString(),
    }
  }

  // DEGRADED: misconfigured domain
  if (!checks.emailFromDomain) {
    return {
      ok: false,
      status: 'DEGRADED',
      reason: 'EMAIL_DOMAIN_MISCONFIGURED',
      checkedAt: new Date().toISOString(),
    }
  }

  return {
    ok: false,
    status: 'DEGRADED',
    reason: 'UNKNOWN_ERROR',
    checkedAt: new Date().toISOString(),
  }
}

export default function handler(req, res) {
  const method = req.method

  // Only GET allowed
  if (method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
    return
  }

  // Rate limit check
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['x-real-ip'] ||
                   req.socket?.remoteAddress ||
                   'unknown'

  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many requests' })
    return
  }

  // CORS — only allow fancluv.com and ops domains
  const origin = req.headers.origin || ''
  const allowedOrigins = [
    'https://fancluv.com',
    'https://www.fancluv.com',
    'https://ops.fancluv.com',
    'https://admin.fancluv.com',
  ]

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  // Prevent caching by search engines and crawlers
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDS}`)

  // Check cache
  const now = Date.now()
  if (healthCache && cacheExpiry > now) {
    res.status(200).json(healthCache)
    return
  }

  // Compute fresh readiness
  const health = checkReadiness()

  // Cache the result
  healthCache = health
  cacheExpiry = now + CACHE_SECONDS * 1000

  res.status(health.ok ? 200 : 503).json(health)
}
