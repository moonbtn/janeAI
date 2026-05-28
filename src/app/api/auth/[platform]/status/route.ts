export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin, ConnectedAccount } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .select('id, platform, platform_user_id, platform_user_name, facebook_pages, selected_page_id, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', platform)
    .maybeSingle()

  return NextResponse.json({
    connected: !!data,
    account: data as ConnectedAccount | null,
  })
}
