import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import { jdHistory } from './schema'

export async function insertJdHistory(values: {
  job_title: string
  raw_input: string
  generated_jd: string
  user_id: string | null
}): Promise<{ id: string }> {
  const rows = await getDb().insert(jdHistory).values(values).returning({ id: jdHistory.id })
  return rows[0]
}

export async function getJdHistoryById(
  id: string,
  opts: { userId?: string },
): Promise<typeof jdHistory.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(jdHistory)
    .where(and(eq(jdHistory.id, id), opts.userId ? eq(jdHistory.user_id, opts.userId) : undefined))
    .limit(1)
  return rows[0] ?? null
}

export async function listJdHistory(opts: {
  userId?: string
  limit: number
}): Promise<Array<Pick<typeof jdHistory.$inferSelect, 'id' | 'job_title' | 'created_at' | 'user_id' | 'status'>>> {
  return getDb()
    .select({
      id: jdHistory.id,
      job_title: jdHistory.job_title,
      created_at: jdHistory.created_at,
      user_id: jdHistory.user_id,
      status: jdHistory.status,
    })
    .from(jdHistory)
    .where(opts.userId ? eq(jdHistory.user_id, opts.userId) : undefined)
    .orderBy(desc(jdHistory.created_at))
    .limit(opts.limit)
}

export async function listActiveJdHistoryForUser(
  userId: string,
): Promise<Array<Pick<typeof jdHistory.$inferSelect, 'id' | 'job_title' | 'created_at'>>> {
  return getDb()
    .select({ id: jdHistory.id, job_title: jdHistory.job_title, created_at: jdHistory.created_at })
    .from(jdHistory)
    .where(and(eq(jdHistory.user_id, userId), eq(jdHistory.status, 'active')))
}

export async function updateJdHistoryStatus(
  id: string,
  userId: string,
  status: 'active' | 'hired',
): Promise<void> {
  await getDb()
    .update(jdHistory)
    .set({ status })
    .where(and(eq(jdHistory.id, id), eq(jdHistory.user_id, userId)))
}

export async function getJdTitleById(id: string): Promise<string | null> {
  const rows = await getDb().select({ job_title: jdHistory.job_title }).from(jdHistory).where(eq(jdHistory.id, id)).limit(1)
  return rows[0]?.job_title ?? null
}

export async function countJdHistory(): Promise<number> {
  const rows = await getDb().select({ count: sql<number>`count(*)`.mapWith(Number) }).from(jdHistory)
  return rows[0].count
}
