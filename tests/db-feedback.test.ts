import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { insertFeedback, listFeedback } from '@/lib/db/feedback'
import { feedback } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

test('insertFeedback + listFeedback round-trip', async () => {
  await insertFeedback({ user_id: 'fb_test_user', email: 'fb@test.dev', message: 'test message' })
  try {
    const rows = await listFeedback()
    const found = rows.find((r) => r.message === 'test message')
    assert.ok(found)
    assert.equal(found?.email, 'fb@test.dev')
  } finally {
    await testDb.delete(feedback).where(eq(feedback.user_id, 'fb_test_user'))
  }
})
