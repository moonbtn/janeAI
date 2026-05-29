export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getSupabase } from '@/lib/supabase'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userEmails = user.emailAddresses.map((e) => e.emailAddress)
  const isAdmin = ADMIN_EMAILS.some((adminEmail) => userEmails.includes(adminEmail))

  const query = getSupabase()
    .from('jd_history')
    .select('id, job_title, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isAdmin) query.eq('user_id', user.id)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ history: data })
}
