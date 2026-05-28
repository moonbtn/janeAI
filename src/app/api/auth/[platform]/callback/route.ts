export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { encrypt } from '@/lib/encryption'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!code || !stateRaw) {
    return NextResponse.redirect(`${appUrl}/app?oauth_error=missing_code`)
  }

  let userId: string
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
    userId = decoded.userId
  } catch {
    return NextResponse.redirect(`${appUrl}/app?oauth_error=invalid_state`)
  }

  try {
    if (platform === 'linkedin') {
      await handleLinkedIn(code, userId, appUrl)
    } else if (platform === 'facebook') {
      await handleFacebook(code, userId, appUrl)
    } else {
      return NextResponse.redirect(`${appUrl}/app?oauth_error=unknown_platform`)
    }
  } catch (err) {
    console.error(`${platform} OAuth callback error:`, err)
    return NextResponse.redirect(`${appUrl}/app?oauth_error=token_exchange_failed`)
  }

  return NextResponse.redirect(`${appUrl}/app?oauth_success=${platform}`)
}

async function handleLinkedIn(code: string, userId: string, appUrl: string) {
  const redirectUri = `${appUrl}/api/auth/linkedin/callback`

  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  })

  const tokenData = await tokenRes.json() as {
    access_token: string
    expires_in: number
  }

  if (!tokenData.access_token) throw new Error('No access_token from LinkedIn')

  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const profile = await profileRes.json() as { sub: string; name: string }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .upsert({
      user_id: userId,
      platform: 'linkedin',
      access_token: encrypt(tokenData.access_token),
      token_expires_at: expiresAt,
      platform_user_id: profile.sub,
      platform_user_name: profile.name,
    }, { onConflict: 'user_id,platform' })
}

async function handleFacebook(code: string, userId: string, appUrl: string) {
  const redirectUri = `${appUrl}/api/auth/facebook/callback`

  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
    `client_id=${process.env.FACEBOOK_APP_ID}` +
    `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${code}`
  )
  const tokenData = await tokenRes.json() as { access_token: string }
  if (!tokenData.access_token) throw new Error('No access_token from Facebook')

  // Exchange for long-lived token (60 days)
  const longRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${process.env.FACEBOOK_APP_ID}` +
    `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
    `&fb_exchange_token=${tokenData.access_token}`
  )
  const longData = await longRes.json() as { access_token: string; expires_in: number }

  const meRes = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${longData.access_token}`
  )
  const me = await meRes.json() as { id: string; name: string }

  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${longData.access_token}`
  )
  const pagesData = await pagesRes.json() as {
    data: Array<{ id: string; name: string; access_token: string }>
  }
  const pages = pagesData.data ?? []

  const expiresAt = new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .upsert({
      user_id: userId,
      platform: 'facebook',
      access_token: encrypt(longData.access_token),
      token_expires_at: expiresAt,
      platform_user_id: me.id,
      platform_user_name: me.name,
      facebook_pages: pages.map(p => ({
        id: p.id,
        name: p.name,
        access_token: encrypt(p.access_token),
      })),
      selected_page_id: pages[0]?.id ?? null,
    }, { onConflict: 'user_id,platform' })
}
