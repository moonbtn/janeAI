import { desc, eq } from 'drizzle-orm'
import { getDb } from './client'
import { questionnaires, questionnaireAnswers } from './schema'
import type { Question } from './types'

export async function insertQuestionnaire(values: {
  jd_history_id: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  language: 'vi' | 'en'
  is_resend?: boolean
}): Promise<{ id: string; token: string }> {
  const rows = await getDb()
    .insert(questionnaires)
    .values(values)
    .returning({ id: questionnaires.id, token: questionnaires.token })
  return rows[0]
}

export async function getQuestionnaireByToken(
  token: string,
): Promise<typeof questionnaires.$inferSelect | null> {
  const rows = await getDb().select().from(questionnaires).where(eq(questionnaires.token, token)).limit(1)
  return rows[0] ?? null
}

export async function getQuestionnaireById(
  id: string,
): Promise<typeof questionnaires.$inferSelect | null> {
  const rows = await getDb().select().from(questionnaires).where(eq(questionnaires.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getLatestQuestionnaireForJd(
  jdHistoryId: string,
): Promise<typeof questionnaires.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.jd_history_id, jdHistoryId))
    .orderBy(desc(questionnaires.created_at))
    .limit(1)
  return rows[0] ?? null
}

export async function insertQuestionnaireAnswerAndMarkAnswered(
  questionnaireId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.insert(questionnaireAnswers).values({ questionnaire_id: questionnaireId, answers })
    await tx.update(questionnaires).set({ status: 'answered' }).where(eq(questionnaires.id, questionnaireId))
  })
}

export async function getLatestAnswerForQuestionnaire(
  questionnaireId: string,
): Promise<typeof questionnaireAnswers.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(questionnaireAnswers)
    .where(eq(questionnaireAnswers.questionnaire_id, questionnaireId))
    .orderBy(desc(questionnaireAnswers.submitted_at))
    .limit(1)
  return rows[0] ?? null
}
