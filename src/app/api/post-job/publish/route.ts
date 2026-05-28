export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { decrypt } from '@/lib/encryption'

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json() as { campaign_id: string }
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!campaign_id) {
    return NextResponse.json({ error: 'Thiếu campaign_id' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign, error: cErr } = await (getSupabaseAdmin() as any)
    .from('post_campaigns')
    .select('id, channel, content, status')
    .eq('id', campaign_id)
    .single()

  if (cErr || !campaign) {
    return NextResponse.json({ error: 'Không tìm thấy campaign' }, { status: 404 })
  }

  if (campaign.status === 'posted') {
    return NextResponse.json({ error: 'Đã đăng rồi' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .select('access_token, platform_user_id, facebook_pages, selected_page_id')
    .eq('user_id', userId)
    .eq('platform', campaign.channel)
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Chưa kết nối tài khoản' }, { status: 400 })
  }

  const token = decrypt(account.access_token)
  let platformPostId: string

  try {
    if (campaign.channel === 'linkedin') {
      platformPostId = await postToLinkedIn(token, account.platform_user_id, campaign.content)
    } else if (campaign.channel === 'facebook') {
      const pageToken = getPageToken(account)
      const pageId = account.selected_page_id
      if (!pageId || !pageToken) {
        return NextResponse.json({ error: 'Chưa chọn Facebook Page' }, { status: 400 })
      }
      platformPostId = await postToFacebook(pageToken, pageId, campaign.content)
    } else {
      return NextResponse.json({ error: 'Kênh này không hỗ trợ direct post' }, { status: 400 })
    }
  } catch (err) {
    console.error('Publish error:', err)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabaseAdmin() as any)
      .from('post_campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign_id)
    return NextResponse.json({ error: 'Lỗi khi đăng lên platform' }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabaseAdmin() as any)
    .from('post_campaigns')
    .update({
      status: 'posted',
      platform_post_id: platformPostId,
      posted_at: new Date().toISOString(),
    })
    .eq('id', campaign_id)

  return NextResponse.json({ ok: true, platform_post_id: platformPostId })
}

function getPageToken(
  account: { facebook_pages: Array<{ id: string; access_token: string }> | null; selected_page_id: string | null }
): string | null {
  if (!account.facebook_pages || !account.selected_page_id) return null
  const page = account.facebook_pages.find(p => p.id === account.selected_page_id)
  if (!page) return null
  return decrypt(page.access_token)
}

async function postToLinkedIn(token: string, personSub: string, content: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${personSub}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LinkedIn API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

async function postToFacebook(pageToken: string, pageId: string, content: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: content,
      access_token: pageToken,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Facebook API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}
