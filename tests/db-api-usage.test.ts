import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { countUsageSince, insertUsage } from '@/lib/db/api-usage'
import { apiUsage } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanup(userId: string, endpoint: string) {
  await testDb.delete(apiUsage).where(and(eq(apiUsage.user_id, userId), eq(apiUsage.endpoint, endpoint)))
}

test('insertUsage then countUsageSince counts it', async () => {
  const userId = 'usage_user_1'
  const endpoint = 'generate'
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const before = await countUsageSince(userId, endpoint, startOfDay)
    await insertUsage(userId, endpoint)
    const after = await countUsageSince(userId, endpoint, startOfDay)

    assert.equal(after, before + 1)
  } finally {
    await cleanup(userId, endpoint)
  }
})

test('countUsageSince ignores calls before the cutoff', async () => {
  const userId = 'usage_user_2'
  const endpoint = 'generate'
  try {
    await insertUsage(userId, endpoint)
    const future = new Date(Date.now() + 60_000)
    const count = await countUsageSince(userId, endpoint, future)
    assert.equal(count, 0)
  } finally {
    await cleanup(userId, endpoint)
  }
})
