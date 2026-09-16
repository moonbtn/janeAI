export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getJdHistoryById } from '@/lib/db/jd-history'
import { getLatestQuestionnaireForJd } from '@/lib/db/questionnaires'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const user = await currentUser()
  const userEmails = user?.emailAddresses.map((e) => e.emailAddress) ?? []
  const isAdmin = ADMIN_EMAILS.some((adminEmail) => userEmails.includes(adminEmail))

  const item = await getJdHistoryById(id, { userId: isAdmin ? undefined : userId })

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const q = await getLatestQuestionnaireForJd(id)

  return NextResponse.json({
    item: {
      ...item,
      questionnaire_id: q?.id ?? null,
      questionnaire_token: q?.token ?? null,
    },
  })
}
