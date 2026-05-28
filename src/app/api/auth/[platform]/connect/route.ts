export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = Buffer.from(JSON.stringify({ userId, platform })).toString('base64url')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let authUrl: string

  if (platform === 'linkedin') {
    const redirectUri = `${appUrl}/api/auth/linkedin/callback`
    authUrl =
      `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code` +
      `&client_id=${process.env.LINKEDIN_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=openid%20profile%20w_member_social` +
      `&state=${state}`
  } else if (platform === 'facebook') {
    const redirectUri = `${appUrl}/api/auth/facebook/callback`
    authUrl =
      `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${process.env.FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=pages_show_list,pages_manage_posts` +
      `&state=${state}`
  } else {
    return NextResponse.json({ error: 'Platform không hỗ trợ' }, { status: 400 })
  }

  return NextResponse.redirect(authUrl)
}
