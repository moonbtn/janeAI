export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Question } from '@/lib/supabase'

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: q, error: qError } = await (getSupabaseAdmin() as any)
    .from('questionnaires')
    .select('id, questions, token, jd_history_id')
    .eq('id', id)
    .single()

  if (qError || !q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jd } = await (getSupabaseAdmin() as any)
    .from('jd_history')
    .select('job_title')
    .eq('id', q.jd_history_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ans } = await (getSupabaseAdmin() as any)
    .from('questionnaire_answers')
    .select('answers, submitted_at')
    .eq('questionnaire_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!ans) return NextResponse.json({ error: 'No answers yet' }, { status: 404 })

  return NextResponse.json({
    jobTitle: jd?.job_title ?? 'Không rõ vị trí',
    submittedAt: ans.submitted_at,
    questions: q.questions,
    answers: ans.answers,
    token: q.token,
  } satisfies QuestionnaireSummaryData)
}
