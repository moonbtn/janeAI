import { desc, eq, inArray } from 'drizzle-orm'
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

export async function getLatestQuestionnairesForJds(
  jdHistoryIds: string[],
): Promise<Map<string, typeof questionnaires.$inferSelect>> {
  if (jdHistoryIds.length === 0) return new Map()
  const rows = await getDb()
    .select()
    .from(questionnaires)
    .where(inArray(questionnaires.jd_history_id, jdHistoryIds))
    .orderBy(desc(questionnaires.created_at))
  const map = new Map<string, typeof questionnaires.$inferSelect>()
  for (const row of rows) {
    if (row.jd_history_id && !map.has(row.jd_history_id)) map.set(row.jd_history_id, row)
  }
  return map
}

export async function getLatestAnswersForQuestionnaires(
  questionnaireIds: string[],
): Promise<Map<string, typeof questionnaireAnswers.$inferSelect>> {
  if (questionnaireIds.length === 0) return new Map()
  const rows = await getDb()
    .select()
    .from(questionnaireAnswers)
    .where(inArray(questionnaireAnswers.questionnaire_id, questionnaireIds))
    .orderBy(desc(questionnaireAnswers.submitted_at))
  const map = new Map<string, typeof questionnaireAnswers.$inferSelect>()
  for (const row of rows) {
    if (row.questionnaire_id && !map.has(row.questionnaire_id)) map.set(row.questionnaire_id, row)
  }
  return map
}
