export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getQuestionnaireById, getLatestAnswerForQuestionnaire } from '@/lib/db/questionnaires'
import { getJdTitleById } from '@/lib/db/jd-history'
import type { Question } from '@/lib/db/types'

export type QuestionnaireSummaryData = {
  jobTitle: string
  submittedAt: string
  questions: Question[]
  answers: Record<string, unknown>
  token: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const q = await getQuestionnaireById(id)
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const jobTitle = q.jd_history_id ? await getJdTitleById(q.jd_history_id) : null
  const ans = await getLatestAnswerForQuestionnaire(id)

  if (!ans) return NextResponse.json({ error: 'No answers yet' }, { status: 404 })

  return NextResponse.json({
    jobTitle: jobTitle ?? 'Không rõ vị trí',
    submittedAt: ans.submitted_at,
    questions: q.questions,
    answers: ans.answers,
    token: q.token,
  } satisfies QuestionnaireSummaryData)
}
