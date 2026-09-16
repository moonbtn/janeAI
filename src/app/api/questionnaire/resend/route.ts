export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getJdHistoryById } from '@/lib/db/jd-history'
import { getLatestQuestionnaireForJd, getLatestAnswerForQuestionnaire, insertQuestionnaire } from '@/lib/db/questionnaires'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jd_history_id } = await req.json() as { jd_history_id: string }
  if (!jd_history_id) return NextResponse.json({ error: 'Missing jd_history_id' }, { status: 400 })

  const jd = await getJdHistoryById(jd_history_id, { userId })
  if (!jd) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const latestQ = await getLatestQuestionnaireForJd(jd_history_id)
  if (!latestQ) return NextResponse.json({ error: 'No questionnaire found' }, { status: 404 })

  const latestAns = await getLatestAnswerForQuestionnaire(latestQ.id)
  const prefilled = latestAns?.answers ?? {}

  try {
    const newQ = await insertQuestionnaire({
      jd_history_id,
      questions: latestQ.questions,
      prefilled_answers: prefilled,
      language: (latestQ.language ?? 'vi') as 'vi' | 'en',
      is_resend: true,
    })
    return NextResponse.json({ id: newQ.id, token: newQ.token, jd_history_id })
  } catch (err) {
    console.error('Resend questionnaire error:', err)
    return NextResponse.json({ error: 'Lỗi tạo bảng hỏi mới' }, { status: 500 })
  }
}
