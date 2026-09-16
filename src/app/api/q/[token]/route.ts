export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getQuestionnaireByToken } from '@/lib/db/questionnaires'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const data = await getQuestionnaireByToken(token)

  if (!data) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (data.status === 'answered') {
    return NextResponse.json({ error: 'Bảng hỏi đã được điền' }, { status: 409 })
  }

  return NextResponse.json({
    id: data.id,
    questions: data.questions,
    prefilled_answers: data.prefilled_answers,
    language: (data.language ?? 'vi') as 'vi' | 'en',
    is_resend: data.is_resend ?? false,
  })
}
