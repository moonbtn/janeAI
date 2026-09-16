import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb } from './client'
import { apiUsage } from './schema'

export async function countUsageSince(userId: string, endpoint: string, since: Date): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(apiUsage)
    .where(and(eq(apiUsage.user_id, userId), eq(apiUsage.endpoint, endpoint), gte(apiUsage.called_at, since)))
  return rows[0].count
}

export async function insertUsage(userId: string, endpoint: string): Promise<void> {
  await getDb().insert(apiUsage).values({ user_id: userId, endpoint })
}
