export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { answers } = await req.json()

  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Thiếu câu trả lời' }, { status: 400 })
  }

  const { data: q, error: fetchError } = await getSupabase()
    .from('questionnaires')
    .select('id, status, expires_at')
    .eq('token', token)
    .single()

  if (fetchError || !q) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (new Date(q.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (q.status === 'answered') {
    return NextResponse.json({ error: 'Đã submit rồi' }, { status: 409 })
  }

  const supabase = getSupabase()

  const { error: insertError } = await supabase
    .from('questionnaire_answers')
    .insert({ questionnaire_id: q.id, answers })

  if (insertError) {
    return NextResponse.json({ error: 'Lỗi lưu câu trả lời' }, { status: 500 })
  }

  await supabase
    .from('questionnaires')
    .update({ status: 'answered' })
    .eq('id', q.id)

  return NextResponse.json({ ok: true })
}
