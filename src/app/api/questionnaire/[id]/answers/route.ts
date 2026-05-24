export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: q, error: qError } = await getSupabase()
    .from('questionnaires')
    .select('id, questions, prefilled_answers, status, jd_history_id')
    .eq('id', id)
    .single()

  if (qError || !q) {
    return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  }

  const { data: ans } = await getSupabase()
    .from('questionnaire_answers')
    .select('answers, submitted_at')
    .eq('questionnaire_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    questionnaire: q,
    answers: ans?.answers ?? null,
    submitted_at: ans?.submitted_at ?? null,
  })
}
