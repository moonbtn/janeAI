export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { message, email } = await req.json()
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Thiếu nội dung feedback' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabaseAdmin() as any)
    .from('feedback')
    .insert({ user_id: email ?? 'anonymous', email: email ?? null, message: message.trim() })

  if (error) {
    console.error('Feedback insert error:', error)
    return NextResponse.json({ error: 'Lỗi lưu feedback' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
