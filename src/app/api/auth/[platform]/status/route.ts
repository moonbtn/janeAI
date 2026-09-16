export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getConnectedAccountStatus } from '@/lib/db/connected-accounts'
import type { ConnectedAccount } from '@/lib/db/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await getConnectedAccountStatus(userId, platform)

  return NextResponse.json({
    connected: !!data,
    account: data as ConnectedAccount | null,
  })
}
