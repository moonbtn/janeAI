export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { saveRecruitingLead } from '@/lib/recruiting-rag/db'
import {
  LeadValidationError,
  normalizeLeadPayload,
  type NormalizedLeadPayload,
} from '@/lib/recruiting-rag/persistence'
import { checkRateLimitSafely } from '@/lib/recruiting-rag/runtime'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Bạn cần đăng nhập lại trước khi gửi thông tin.' }, { status: 401 })
  }

  const { allowed } = await checkRateLimitSafely(userId, 'recruiting-leads')
  if (!allowed) {
    return NextResponse.json({ error: 'Bạn đã gửi thông tin quá nhiều lần hôm nay.' }, { status: 429 })
  }

  let payload: NormalizedLeadPayload
  try {
    payload = normalizeLeadPayload(await request.json())
  } catch (error) {
    const message =
      error instanceof LeadValidationError ? error.message : 'Dữ liệu gửi lên không hợp lệ.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const id = await saveRecruitingLead({ userId, payload })
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('Recruiting lead error:', error)
    return NextResponse.json({ error: 'Không lưu được thông tin, thử lại nhé.' }, { status: 500 })
  }
}
