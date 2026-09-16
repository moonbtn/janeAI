export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { updateJdHistoryStatus } from '@/lib/db/jd-history'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await req.json() as { status: string }

  if (status !== 'active' && status !== 'hired') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    await updateJdHistoryStatus(id, userId, status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
