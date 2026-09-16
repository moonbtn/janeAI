export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getQuestionnaireByToken, insertQuestionnaireAnswerAndMarkAnswered } from '@/lib/db/questionnaires'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { answers } = await req.json()

  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Thiếu câu trả lời' }, { status: 400 })
  }

  const q = await getQuestionnaireByToken(token)

  if (!q) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (q.expires_at && new Date(q.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (q.status === 'answered') {
    return NextResponse.json({ error: 'Đã submit rồi' }, { status: 409 })
  }

  try {
    await insertQuestionnaireAnswerAndMarkAnswered(q.id, answers)
  } catch (err) {
    console.error('Submit answers error:', err)
    return NextResponse.json({ error: 'Lỗi lưu câu trả lời' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
