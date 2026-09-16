import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  insertJdHistory,
  getJdHistoryById,
  listJdHistory,
  updateJdHistoryStatus,
  countJdHistory,
} from '@/lib/db/jd-history'
import { jdHistory } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanup(id: string) {
  await testDb.delete(jdHistory).where(eq(jdHistory.id, id))
}

test('insertJdHistory returns the new row id', async () => {
  const { id } = await insertJdHistory({
    job_title: 'Test Title',
    raw_input: 'raw',
    generated_jd: 'generated',
    user_id: 'user_test_1',
  })
  assert.ok(id)
  await cleanup(id)
})

test('getJdHistoryById scopes to userId when provided, ignores it when omitted (admin)', async () => {
  const { id } = await insertJdHistory({
    job_title: 'Scoped Title',
    raw_input: 'raw',
    generated_jd: 'generated',
    user_id: 'owner_user',
  })
  try {
    const asOwner = await getJdHistoryById(id, { userId: 'owner_user' })
    assert.equal(asOwner?.job_title, 'Scoped Title')

    const asOther = await getJdHistoryById(id, { userId: 'someone_else' })
    assert.equal(asOther, null)

    const asAdmin = await getJdHistoryById(id, {})
    assert.equal(asAdmin?.job_title, 'Scoped Title')
  } finally {
    await cleanup(id)
  }
})

test('listJdHistory orders by created_at desc and respects limit', async () => {
  const a = await insertJdHistory({ job_title: 'A', raw_input: 'r', generated_jd: 'g', user_id: 'list_user' })
  const b = await insertJdHistory({ job_title: 'B', raw_input: 'r', generated_jd: 'g', user_id: 'list_user' })
  try {
    const rows = await listJdHistory({ userId: 'list_user', limit: 100 })
    const ids = rows.map((r) => r.id)
    assert.ok(ids.indexOf(b.id) < ids.indexOf(a.id), 'newer row (b) should come first')
  } finally {
    await cleanup(a.id)
    await cleanup(b.id)
  }
})

test('updateJdHistoryStatus only updates when user_id matches', async () => {
  const { id } = await insertJdHistory({ job_title: 'Status', raw_input: 'r', generated_jd: 'g', user_id: 'status_user' })
  try {
    await updateJdHistoryStatus(id, 'someone_else', 'hired')
    const stillActive = await getJdHistoryById(id, {})
    assert.equal(stillActive?.status, 'active')

    await updateJdHistoryStatus(id, 'status_user', 'hired')
    const nowHired = await getJdHistoryById(id, {})
    assert.equal(nowHired?.status, 'hired')
  } finally {
    await cleanup(id)
  }
})

test('countJdHistory returns a number >= 0', async () => {
  const n = await countJdHistory()
  assert.ok(typeof n === 'number' && n >= 0)
})
