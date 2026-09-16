export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getQuestionnaireById, getLatestAnswerForQuestionnaire } from '@/lib/db/questionnaires'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const q = await getQuestionnaireById(id)

  if (!q) {
    return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  }

  const ans = await getLatestAnswerForQuestionnaire(id)

  return NextResponse.json({
    questionnaire: q,
    answers: ans?.answers ?? null,
    submitted_at: ans?.submitted_at ?? null,
  })
}
