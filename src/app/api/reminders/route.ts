export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabaseAdmin() as any

  const { data: jds, error } = await sb
    .from('jd_history')
    .select('id, job_title, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) return NextResponse.json({ reminders: [] })

  const reminders: { jd_history_id: string; job_title: string }[] = []

  for (const jd of jds ?? []) {
    // Get latest questionnaire for this JD
    const { data: latestQ } = await sb
      .from('questionnaires')
      .select('id, status, created_at')
      .eq('jd_history_id', jd.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // If there's a pending (unanswered) questionnaire, no reminder needed
    if (latestQ?.status === 'pending') continue

    // If no questionnaire exists at all, skip
    if (!latestQ) continue

    // Get latest answer for this questionnaire
    const { data: latestAns } = await sb
      .from('questionnaire_answers')
      .select('submitted_at')
      .eq('questionnaire_id', latestQ?.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestAns?.submitted_at) continue

    const age = Date.now() - new Date(latestAns.submitted_at).getTime()
    if (age >= THIRTY_DAYS_MS) {
      reminders.push({ jd_history_id: jd.id, job_title: jd.job_title })
    }
  }

  return NextResponse.json({ reminders })
}
