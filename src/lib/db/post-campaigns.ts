import { eq } from 'drizzle-orm'
import { getDb } from './client'
import { postCampaigns, jdHistory } from './schema'

export async function listCampaignsForJd(jdHistoryId: string) {
  return getDb()
    .select({
      id: postCampaigns.id,
      channel: postCampaigns.channel,
      content: postCampaigns.content,
      status: postCampaigns.status,
      posted_at: postCampaigns.posted_at,
      platform_post_id: postCampaigns.platform_post_id,
    })
    .from(postCampaigns)
    .where(eq(postCampaigns.jd_history_id, jdHistoryId))
    .orderBy(postCampaigns.created_at)
}

export async function updateCampaignContent(campaignId: string, content: string): Promise<void> {
  await getDb().update(postCampaigns).set({ content }).where(eq(postCampaigns.id, campaignId))
}

export async function upsertCampaignDraft(values: {
  jd_history_id: string
  channel: string
  content: string
}): Promise<typeof postCampaigns.$inferSelect> {
  const rows = await getDb()
    .insert(postCampaigns)
    .values({ ...values, status: 'draft' })
    .onConflictDoUpdate({
      target: [postCampaigns.jd_history_id, postCampaigns.channel],
      set: { content: values.content, status: 'draft' },
    })
    .returning()
  return rows[0]
}

export async function getCampaignWithOwner(campaignId: string): Promise<{
  id: string
  channel: string
  content: string
  status: string
  owner_user_id: string | null
} | null> {
  const rows = await getDb()
    .select({
      id: postCampaigns.id,
      channel: postCampaigns.channel,
      content: postCampaigns.content,
      status: postCampaigns.status,
      owner_user_id: jdHistory.user_id,
    })
    .from(postCampaigns)
    .innerJoin(jdHistory, eq(postCampaigns.jd_history_id, jdHistory.id))
    .where(eq(postCampaigns.id, campaignId))
    .limit(1)
  return rows[0] ?? null
}

export async function markCampaignStatus(
  campaignId: string,
  status: 'failed' | 'posted',
  extra?: { platform_post_id?: string; posted_at?: string },
): Promise<void> {
  await getDb()
    .update(postCampaigns)
    .set({
      status,
      platform_post_id: extra?.platform_post_id,
      posted_at: extra?.posted_at ? new Date(extra.posted_at) : undefined,
    })
    .where(eq(postCampaigns.id, campaignId))
}
