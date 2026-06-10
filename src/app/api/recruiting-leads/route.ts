export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { checkRateLimit } from '@/lib/rate-limit'
import { saveRecruitingLead } from '@/lib/recruiting-rag/db'
import { normalizeLeadPayload } from '@/lib/recruiting-rag/persistence'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkRateLimit(userId, 'recruiting-leads')
  if (!allowed) {
    return NextResponse.json({ error: 'Bạn đã gửi thông tin quá nhiều lần hôm nay.' }, { status: 429 })
  }

  try {
    const payload = normalizeLeadPayload(await request.json())
    const id = await saveRecruitingLead({ userId, payload })
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('Recruiting lead error:', error)
    return NextResponse.json({ error: 'Không lưu được thông tin, thử lại nhé.' }, { status: 400 })
  }
}
