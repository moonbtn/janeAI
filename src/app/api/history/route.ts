export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { listJdHistory } from '@/lib/db/jd-history'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userEmails = user.emailAddresses.map((e) => e.emailAddress)
  const isAdmin = ADMIN_EMAILS.some((adminEmail) => userEmails.includes(adminEmail))

  try {
    const data = await listJdHistory({ userId: isAdmin ? undefined : user.id, limit: 100 })
    return NextResponse.json({ history: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
