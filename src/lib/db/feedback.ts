import { desc } from 'drizzle-orm'
import { getDb } from './client'
import { feedback } from './schema'

export async function insertFeedback(values: {
  user_id: string
  email: string | null
  message: string
}): Promise<void> {
  await getDb().insert(feedback).values(values)
}

export async function listFeedback() {
  return getDb()
    .select({ id: feedback.id, email: feedback.email, message: feedback.message, created_at: feedback.created_at })
    .from(feedback)
    .orderBy(desc(feedback.created_at))
}
