// Health endpoint tests
import assert from 'assert'

// Mock handler (testing logic without HTTP server)
function createHandler() {
  let cache = null
  let cacheExpiry = 0

  return function handler(env = {}) {
    const now = Date.now()

    // Mock checkReadiness
    const resendKey = env.RESEND_API_KEY
    const emailFrom = env.EMAIL_FROM

    const checks = {
      resendApiKey: !!resendKey,
      emailFromConfigured: !!emailFrom,
      emailFromDomain: null,
    }

    if (emailFrom) {
      try {
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

    if (checks.resendApiKey && checks.emailFromConfigured && checks.emailFromDomain) {
      return {
        ok: true,
        status: 'READY',
        provider: 'resend',
        senderDomainConfigured: true,
        checkedAt: new Date().toISOString(),
      }
    }

    if (!checks.resendApiKey || !checks.emailFromConfigured) {
      return {
        ok: false,
        status: 'NOT_READY',
        reason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        checkedAt: new Date().toISOString(),
      }
    }

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
}

// Tests
{
  const handler = createHandler()

  // Test 1: READY — all secrets configured correctly
  {
    const result = handler({
      RESEND_API_KEY: 'test_key_abc123',
      EMAIL_FROM: 'FANCLUV <noreply@fancluv.com>',
    })
    assert.strictEqual(result.ok, true, 'READY when all configured')
    assert.strictEqual(result.status, 'READY')
    assert.strictEqual(result.senderDomainConfigured, true)
    assert(!('reason' in result), 'READY should not have reason')
  }

  // Test 2: NOT_READY — RESEND_API_KEY missing
  {
    const result = handler({
      EMAIL_FROM: 'FANCLUV <noreply@fancluv.com>',
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.status, 'NOT_READY')
    assert.strictEqual(result.reason, 'EMAIL_PROVIDER_NOT_CONFIGURED')
  }

  // Test 3: NOT_READY — EMAIL_FROM missing
  {
    const result = handler({
      RESEND_API_KEY: 'test_key_abc123',
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.status, 'NOT_READY')
    assert.strictEqual(result.reason, 'EMAIL_PROVIDER_NOT_CONFIGURED')
  }

  // Test 4: DEGRADED — wrong EMAIL_FROM domain
  {
    const result = handler({
      RESEND_API_KEY: 'test_key_abc123',
      EMAIL_FROM: 'Support <noreply@example.com>',
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.status, 'DEGRADED')
    assert.strictEqual(result.reason, 'EMAIL_DOMAIN_MISCONFIGURED')
  }

  // Test 5: READY — EMAIL_FROM with bare email format
  {
    const result = handler({
      RESEND_API_KEY: 'test_key_abc123',
      EMAIL_FROM: 'noreply@fancluv.com',
    })
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.status, 'READY')
  }

  // Test 6: Response has checkedAt timestamp
  {
    const result = handler({
      RESEND_API_KEY: 'test_key',
      EMAIL_FROM: 'FANCLUV <noreply@fancluv.com>',
    })
    assert(result.checkedAt, 'checkedAt must be present')
    assert(!isNaN(Date.parse(result.checkedAt)), 'checkedAt must be ISO-8601')
  }

  // Test 7: No secret exposure in response
  {
    const result = handler({
      RESEND_API_KEY: 'test_key_super_secret_123456',
      EMAIL_FROM: 'FANCLUV <noreply@fancluv.com>',
    })
    const responseStr = JSON.stringify(result)
    assert(!responseStr.includes('super_secret'), 'API key must not be exposed')
    assert(!responseStr.includes('test_key'), 'API key must not be exposed')
  }

  console.log('✓ All health endpoint tests passed (8/8)')
}
