import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  upsertConnectedAccount,
  deleteConnectedAccount,
  getConnectedAccountStatus,
  getConnectedAccountForPublish,
} from '@/lib/db/connected-accounts'
import { connectedAccounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanup(userId: string, platform: string) {
  await testDb.delete(connectedAccounts).where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
}

test('upsertConnectedAccount inserts then updates on conflict (user_id, platform)', async () => {
  const userId = 'ca_user_1'
  try {
    await upsertConnectedAccount({ user_id: userId, platform: 'linkedin', access_token: 'enc1', platform_user_id: 'p1', platform_user_name: 'Name 1' })
    const first = await getConnectedAccountStatus(userId, 'linkedin')
    assert.equal(first?.platform_user_name, 'Name 1')

    await upsertConnectedAccount({ user_id: userId, platform: 'linkedin', access_token: 'enc2', platform_user_id: 'p1', platform_user_name: 'Name 2' })
    const second = await getConnectedAccountStatus(userId, 'linkedin')
    assert.equal(second?.platform_user_name, 'Name 2')
  } finally {
    await cleanup(userId, 'linkedin')
  }
})

test('getConnectedAccountForPublish exposes access_token, status endpoint does not', async () => {
  const userId = 'ca_user_2'
  try {
    await upsertConnectedAccount({ user_id: userId, platform: 'facebook', access_token: 'secret-token', platform_user_id: 'p2', platform_user_name: 'FB Name' })
    const forPublish = await getConnectedAccountForPublish(userId, 'facebook')
    assert.equal(forPublish?.access_token, 'secret-token')

    const status = await getConnectedAccountStatus(userId, 'facebook')
    assert.equal((status as unknown as { access_token?: string }).access_token, undefined)
  } finally {
    await cleanup(userId, 'facebook')
  }
})

test('deleteConnectedAccount removes the row', async () => {
  const userId = 'ca_user_3'
  await upsertConnectedAccount({ user_id: userId, platform: 'linkedin', access_token: 'x', platform_user_id: 'p3', platform_user_name: 'N' })
  await deleteConnectedAccount(userId, 'linkedin')
  const after = await getConnectedAccountStatus(userId, 'linkedin')
  assert.equal(after, null)
})
