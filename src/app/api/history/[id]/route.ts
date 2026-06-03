export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check admin
  const { currentUser } = await import('@clerk/nextjs/server')
  const user = await currentUser()
  const userEmails = user?.emailAddresses.map((e) => e.emailAddress) ?? []
  const isAdmin = ADMIN_EMAILS.some((adminEmail) => userEmails.includes(adminEmail))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (getSupabaseAdmin() as any)
    .from('jd_history')
    .select('*')
    .eq('id', id)

  if (!isAdmin) query = query.eq('user_id', userId)

  const { data: item, error } = await query.single()

  if (error || !item) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  }

  // Also fetch the questionnaire (if any) for this jd_history entry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: q } = await (getSupabaseAdmin() as any)
    .from('questionnaires')
    .select('id, token')
    .eq('jd_history_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    item: {
      ...item,
      questionnaire_id: q?.id ?? null,
      questionnaire_token: q?.token ?? null,
    },
  })
}
