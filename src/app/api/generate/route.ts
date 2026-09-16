export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { insertJdHistory } from '@/lib/db/jd-history'
import { checkRateLimit } from '@/lib/rate-limit'
import { callAnthropicWithFallback } from '@/lib/ai/models'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkRateLimit(userId, 'generate')
  if (!allowed) {
    return NextResponse.json(
      { error: 'Bạn đã đạt giới hạn 10 lần tạo JD mỗi ngày. Thử lại vào ngày mai.' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  try {
    const { jobTitle, rawInput } = await req.json()

    if (!jobTitle || !rawInput) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
    }

    const message = await callAnthropicWithFallback(client, 'heavy', {
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia viết JD (Job Description) cho thị trường tuyển dụng Việt Nam.

Hãy viết một JD chuyên nghiệp, hấp dẫn bằng tiếng Việt dựa trên thông tin sau:

**Vị trí tuyển dụng:** ${jobTitle}

**Yêu cầu thô từ khách hàng:**
${rawInput}

Viết JD theo cấu trúc sau:
1. **Giới thiệu công ty/vị trí** (2-3 câu hấp dẫn)
2. **Mô tả công việc** (bullet points, 5-7 điểm)
3. **Yêu cầu ứng viên** (bullet points, 5-6 điểm)
4. **Quyền lợi** (bullet points, 4-5 điểm)
5. **Thông tin ứng tuyển**

Viết tự nhiên, chuyên nghiệp, hấp dẫn ứng viên. Không bịa thông tin không có trong yêu cầu gốc.`,
        },
      ],
    })

    const firstBlock = message.content[0]
    const generatedJd = firstBlock?.type === 'text' ? firstBlock.text : ''

    let jdHistoryId: string | null = null
    try {
      const inserted = await insertJdHistory({
        job_title: jobTitle,
        raw_input: rawInput,
        generated_jd: generatedJd,
        user_id: userId,
      })
      jdHistoryId = inserted.id
    } catch (err) {
      console.error('DB error inserting jd_history:', err)
    }

    return NextResponse.json({ generatedJd, jdHistoryId })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại nhé!' }, { status: 500 })
  }
}
