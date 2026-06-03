export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jd_history_id } = await req.json() as { jd_history_id: string }
  if (!jd_history_id) return NextResponse.json({ error: 'Missing jd_history_id' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabaseAdmin() as any

  // Verify ownership
  const { data: jd } = await sb
    .from('jd_history')
    .select('id')
    .eq('id', jd_history_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!jd) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get latest questionnaire for this JD
  const { data: latestQ } = await sb
    .from('questionnaires')
    .select('id, questions, language')
    .eq('jd_history_id', jd_history_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestQ) return NextResponse.json({ error: 'No questionnaire found' }, { status: 404 })

  // Get latest submitted answers
  const { data: latestAns } = await sb
    .from('questionnaire_answers')
    .select('answers')
    .eq('questionnaire_id', latestQ.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prefilled = latestAns?.answers ?? {}

  // Create new questionnaire with previous answers as prefill, is_resend = true
  const { data: newQ, error } = await sb
    .from('questionnaires')
    .insert({
      jd_history_id,
      questions: latestQ.questions,
      prefilled_answers: prefilled,
      language: latestQ.language ?? 'vi',
      is_resend: true,
    })
    .select('id, token')
    .maybeSingle()

  if (error || !newQ) {
    console.error('Resend questionnaire error:', error)
    return NextResponse.json({ error: 'Lỗi tạo bảng hỏi mới' }, { status: 500 })
  }

  return NextResponse.json({ id: newQ.id, token: newQ.token, jd_history_id })
}
