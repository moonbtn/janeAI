export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listCampaignsForJd, updateCampaignContent } from '@/lib/db/post-campaigns'

export async function GET(req: NextRequest) {
  const jd_history_id = req.nextUrl.searchParams.get('jd_id')

  if (!jd_history_id) {
    return NextResponse.json({ error: 'Thiếu jd_id' }, { status: 400 })
  }

  try {
    const data = await listCampaignsForJd(jd_history_id)
    return NextResponse.json({ campaigns: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { campaign_id, content } = await req.json() as { campaign_id: string; content: string }

  if (!campaign_id || !content) {
    return NextResponse.json({ error: 'Thiếu campaign_id hoặc content' }, { status: 400 })
  }

  try {
    await updateCampaignContent(campaign_id, content)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
