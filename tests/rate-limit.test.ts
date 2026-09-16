import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit } from '@/lib/rate-limit'
import { createDb } from '@/lib/db/client'
import { apiUsage } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

test('checkRateLimit allows under the limit and blocks at it', async () => {
  const userId = 'rl_user_1'
  try {
    // 'recruiting-leads' has the lowest DAILY_LIMITS entry (10), cheapest to exhaust in a test
    for (let i = 0; i < 10; i++) {
      const { allowed } = await checkRateLimit(userId, 'recruiting-leads')
      assert.equal(allowed, true, `call ${i} should be allowed`)
    }
    const { allowed, remaining } = await checkRateLimit(userId, 'recruiting-leads')
    assert.equal(allowed, false)
    assert.equal(remaining, 0)
  } finally {
    await testDb.delete(apiUsage).where(eq(apiUsage.user_id, userId))
  }
})
