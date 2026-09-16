export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { listActiveJdHistoryForUser } from '@/lib/db/jd-history'
import { getLatestQuestionnairesForJds, getLatestAnswersForQuestionnaires } from '@/lib/db/questionnaires'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let jds: Awaited<ReturnType<typeof listActiveJdHistoryForUser>>
  try {
    jds = await listActiveJdHistoryForUser(userId)
  } catch (err) {
    console.error('listActiveJdHistoryForUser failed:', err)
    return NextResponse.json({ reminders: [] })
  }

  const jdIds = jds.map((jd) => jd.id)
  const latestQByJd = await getLatestQuestionnairesForJds(jdIds)
  const questionnaireIds = [...latestQByJd.values()].map((q) => q.id)
  const latestAnsByQ = await getLatestAnswersForQuestionnaires(questionnaireIds)

  const reminders: { jd_history_id: string; job_title: string }[] = []

  for (const jd of jds) {
    const latestQ = latestQByJd.get(jd.id)
    if (!latestQ) continue
    if (latestQ.status === 'pending') continue

    const latestAns = latestAnsByQ.get(latestQ.id)
    if (!latestAns?.submitted_at) continue

    const age = Date.now() - new Date(latestAns.submitted_at).getTime()
    if (age >= THIRTY_DAYS_MS) {
      reminders.push({ jd_history_id: jd.id, job_title: jd.job_title })
    }
  }

  return NextResponse.json({ reminders })
}
