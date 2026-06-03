// src/app/api/bootcamp/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { appendRegistration } from '@/lib/google-sheets'
import { sendTelegram } from '@/lib/telegram'
import { sendBootcampConfirmationEmail } from '@/lib/resend-email'

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; email?: string; phone?: string }

  const { name, email, phone } = body
  if (!name || !email || !phone) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  }

  const submittedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

  await Promise.all([
    appendRegistration({ name, email, phone, submittedAt }),
    sendTelegram(`🎉 <b>Đăng ký mới!</b>\n👤 ${name}\n📧 ${email}\n📞 ${phone}\n🕐 ${submittedAt}`),
    sendBootcampConfirmationEmail({ to: email, name }),
  ])

  return NextResponse.json({ success: true })
}
