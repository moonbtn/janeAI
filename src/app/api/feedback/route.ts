export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { insertFeedback } from '@/lib/db/feedback'

export async function POST(req: NextRequest) {
  const { message, email } = await req.json()
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Thiếu nội dung feedback' }, { status: 400 })
  }

  try {
    await insertFeedback({ user_id: email ?? 'anonymous', email: email ?? null, message: message.trim() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feedback insert error:', err)
    return NextResponse.json({ error: 'Lỗi lưu feedback' }, { status: 500 })
  }
}
