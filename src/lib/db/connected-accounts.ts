import { and, eq } from 'drizzle-orm'
import { getDb } from './client'
import { connectedAccounts } from './schema'

export async function upsertConnectedAccount(values: {
  user_id: string
  platform: string
  access_token: string
  platform_user_id?: string | null
  platform_user_name?: string | null
  token_expires_at?: string
  facebook_pages?: Array<{ id: string; name: string; access_token: string }> | null
  selected_page_id?: string | null
}): Promise<void> {
  // drizzle's timestamp column (default 'date' mode) expects a Date instance,
  // not an ISO string, for both insert and update — convert here so callers
  // (OAuth callback routes) can keep passing plain ISO strings.
  const row = {
    ...values,
    token_expires_at: values.token_expires_at ? new Date(values.token_expires_at) : undefined,
  }
  await getDb()
    .insert(connectedAccounts)
    .values(row)
    .onConflictDoUpdate({
      target: [connectedAccounts.user_id, connectedAccounts.platform],
      set: row,
    })
}

export async function deleteConnectedAccount(userId: string, platform: string): Promise<void> {
  await getDb()
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
}

export async function getConnectedAccountStatus(userId: string, platform: string) {
  const rows = await getDb()
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platform_user_id: connectedAccounts.platform_user_id,
      platform_user_name: connectedAccounts.platform_user_name,
      facebook_pages: connectedAccounts.facebook_pages,
      selected_page_id: connectedAccounts.selected_page_id,
      token_expires_at: connectedAccounts.token_expires_at,
    })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
    .limit(1)
  return rows[0] ?? null
}

export async function getConnectedAccountForPublish(userId: string, platform: string) {
  const rows = await getDb()
    .select({
      access_token: connectedAccounts.access_token,
      platform_user_id: connectedAccounts.platform_user_id,
      facebook_pages: connectedAccounts.facebook_pages,
      selected_page_id: connectedAccounts.selected_page_id,
    })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
    .limit(1)
  return rows[0] ?? null
}
