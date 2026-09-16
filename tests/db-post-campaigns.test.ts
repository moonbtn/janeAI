import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { insertJdHistory } from '@/lib/db/jd-history'
import {
  listCampaignsForJd,
  updateCampaignContent,
  upsertCampaignDraft,
  getCampaignWithOwner,
  markCampaignStatus,
} from '@/lib/db/post-campaigns'
import { jdHistory, postCampaigns } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanupJd(id: string) {
  // post_campaigns.jd_history_id has an FK to jd_history.id with no cascade,
  // so campaign rows created in a test must be removed first.
  await testDb.delete(postCampaigns).where(eq(postCampaigns.jd_history_id, id))
  await testDb.delete(jdHistory).where(eq(jdHistory.id, id))
}

test('upsertCampaignDraft inserts then updates on conflict (jd_history_id, channel)', async () => {
  const jd = await insertJdHistory({ job_title: 'Campaign JD', raw_input: 'r', generated_jd: 'g', user_id: 'camp_user' })
  try {
    const first = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'linkedin', content: 'v1' })
    assert.equal(first.content, 'v1')

    const second = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'linkedin', content: 'v2' })
    assert.equal(second.id, first.id, 'same campaign row should be reused, not duplicated')
    assert.equal(second.content, 'v2')

    const all = await listCampaignsForJd(jd.id)
    assert.equal(all.length, 1)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getCampaignWithOwner joins jd_history.user_id', async () => {
  const jd = await insertJdHistory({ job_title: 'Owner JD', raw_input: 'r', generated_jd: 'g', user_id: 'owner_123' })
  try {
    const campaign = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'facebook', content: 'hello' })
    const withOwner = await getCampaignWithOwner(campaign.id)
    assert.equal(withOwner?.owner_user_id, 'owner_123')
  } finally {
    await cleanupJd(jd.id)
  }
})

test('updateCampaignContent and markCampaignStatus mutate the row', async () => {
  const jd = await insertJdHistory({ job_title: 'Mutate JD', raw_input: 'r', generated_jd: 'g', user_id: 'mut_user' })
  try {
    const campaign = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'threads', content: 'orig' })
    await updateCampaignContent(campaign.id, 'edited')
    await markCampaignStatus(campaign.id, 'posted', { platform_post_id: 'abc123', posted_at: new Date().toISOString() })

    const rows = await listCampaignsForJd(jd.id)
    assert.equal(rows[0].content, 'edited')
    assert.equal(rows[0].status, 'posted')
    assert.equal(rows[0].platform_post_id, 'abc123')
  } finally {
    await cleanupJd(jd.id)
  }
})
