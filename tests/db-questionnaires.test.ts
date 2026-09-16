import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  insertQuestionnaire,
  getQuestionnaireByToken,
  getQuestionnaireById,
  getLatestQuestionnaireForJd,
  insertQuestionnaireAnswerAndMarkAnswered,
  getLatestAnswerForQuestionnaire,
} from '@/lib/db/questionnaires'
import { insertJdHistory } from '@/lib/db/jd-history'
import { jdHistory } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanupJd(id: string) {
  // cascades to questionnaires -> questionnaire_answers via FK on delete cascade
  await testDb.delete(jdHistory).where(eq(jdHistory.id, id))
}

test('insertQuestionnaire returns id and a DB-generated token', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({
      jd_history_id: jd.id,
      questions: [],
      prefilled_answers: {},
      language: 'vi',
    })
    assert.ok(q.id)
    assert.ok(q.token && q.token.length > 0)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getQuestionnaireByToken finds it, returns null for unknown token', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 2', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    const found = await getQuestionnaireByToken(q.token)
    assert.equal(found?.id, q.id)

    const missing = await getQuestionnaireByToken('nonexistent-token-xyz')
    assert.equal(missing, null)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getLatestQuestionnaireForJd returns the most recently created one', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 3', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const first = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await new Promise((r) => setTimeout(r, 10))
    const second = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi', is_resend: true })
    const latest = await getLatestQuestionnaireForJd(jd.id)
    assert.equal(latest?.id, second.id)
    void first
  } finally {
    await cleanupJd(jd.id)
  }
})

test('insertQuestionnaireAnswerAndMarkAnswered is atomic: both writes land together', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 4', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await insertQuestionnaireAnswerAndMarkAnswered(q.id, { hello: 'world' })

    const updated = await getQuestionnaireById(q.id)
    assert.equal(updated?.status, 'answered')

    const answer = await getLatestAnswerForQuestionnaire(q.id)
    assert.deepEqual(answer?.answers, { hello: 'world' })
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getLatestAnswerForQuestionnaire returns null when no answer submitted yet', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 5', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    const answer = await getLatestAnswerForQuestionnaire(q.id)
    assert.equal(answer, null)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getLatestQuestionnairesForJds returns the latest questionnaire per jd id', async () => {
  const jdA = await insertJdHistory({ job_title: 'Batch A', raw_input: 'r', generated_jd: 'g', user_id: 'batch_user' })
  const jdB = await insertJdHistory({ job_title: 'Batch B', raw_input: 'r', generated_jd: 'g', user_id: 'batch_user' })
  try {
    const qA1 = await insertQuestionnaire({ jd_history_id: jdA.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await new Promise((r) => setTimeout(r, 10))
    const qA2 = await insertQuestionnaire({ jd_history_id: jdA.id, questions: [], prefilled_answers: {}, language: 'vi', is_resend: true })
    const qB1 = await insertQuestionnaire({ jd_history_id: jdB.id, questions: [], prefilled_answers: {}, language: 'vi' })

    const { getLatestQuestionnairesForJds } = await import('@/lib/db/questionnaires')
    const map = await getLatestQuestionnairesForJds([jdA.id, jdB.id])
    assert.equal(map.get(jdA.id)?.id, qA2.id)
    assert.equal(map.get(jdB.id)?.id, qB1.id)
    void qA1
  } finally {
    await cleanupJd(jdA.id)
    await cleanupJd(jdB.id)
  }
})

test('getLatestAnswersForQuestionnaires returns the latest answer per questionnaire id', async () => {
  const jd = await insertJdHistory({ job_title: 'Batch Ans', raw_input: 'r', generated_jd: 'g', user_id: 'batch_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await insertQuestionnaireAnswerAndMarkAnswered(q.id, { a: 1 })

    const { getLatestAnswersForQuestionnaires } = await import('@/lib/db/questionnaires')
    const map = await getLatestAnswersForQuestionnaires([q.id])
    assert.deepEqual(map.get(q.id)?.answers, { a: 1 })
  } finally {
    await cleanupJd(jd.id)
  }
})
