// src/app/api/bootcamp/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { appendRegistration } from '@/lib/google-sheets'
import { sendTelegram } from '@/lib/telegram'
import { sendBootcampConfirmationEmail } from '@/lib/resend-email'

// Simple in-memory rate limiter: max 5 submissions per IP per 10 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' }, { status: 429 })
  }

  let body: { name?: string; email?: string; phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, phone } = body
  if (!name || !email || !phone) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  }

  const submittedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

  const results = await Promise.allSettled([
    appendRegistration({ name, email, phone, submittedAt }),
    sendTelegram(`🎉 <b>Đăng ký mới!</b>\n👤 ${name}\n📧 ${email}\n📞 ${phone}\n🕐 ${submittedAt}`),
    sendBootcampConfirmationEmail({ to: email, name }),
  ])

  const [sheetsResult] = results
  if (sheetsResult.status === 'rejected') {
    console.error('Failed to save registration to Google Sheets:', sheetsResult.reason)
    return NextResponse.json({ error: 'Đăng ký thất bại, vui lòng thử lại.' }, { status: 500 })
  }

  // Log non-critical failures (Telegram/email) but don't fail the request
  results.slice(1).forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Non-critical failure [${i === 0 ? 'telegram' : 'email'}]:`, r.reason)
    }
  })

  return NextResponse.json({ success: true })
}
