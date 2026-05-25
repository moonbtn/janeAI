export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { Question } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { jdHistoryId, jobTitle, generatedJd } = await req.json()

    if (!jdHistoryId || !jobTitle || !generatedJd) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia tuyển dụng. Dựa trên JD sau, hãy tạo bảng hỏi 7 nhóm dành cho HIRING MANAGER (sếp trực tiếp), KHÔNG phải HR.

Câu hỏi phải là những gì sếp biết và quyết định được: lý do mở vị trí, tiêu chí thực sự, văn hoá team, lịch phỏng vấn, điểm đặc biệt của team. KHÔNG hỏi về gói bảo hiểm, training budget (đó là việc HR).

**JD:**
${generatedJd}

Trả về JSON theo đúng format sau, không thêm bất kỳ text nào khác:

{
  "questions": [
    {
      "id": "outcome_1",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "Vị trí này được tạo ra để giải quyết vấn đề gì?",
      "type": "open",
      "aiPrefilled": true
    },
    {
      "id": "outcome_2",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "Mức độ urgent?",
      "type": "yes_no",
      "options": ["Gấp — cần người trong 1 tháng", "Bình thường — 2-3 tháng"],
      "aiPrefilled": true
    }
  ],
  "prefilled_answers": {
    "outcome_1": "Lý do mở vị trí dựa trên JD...",
    "outcome_2": "Bình thường — 2-3 tháng"
  }
}

Tạo đủ 7 nhóm theo cấu trúc:
- Section 1 (Outcome): 3 câu — vấn đề cần giải quyết (open, aiPrefilled), urgent (yes_no, aiPrefilled), bảo mật (yes_no, aiPrefilled)
- Section 2 (History): 2 câu — tuyển bao lâu (multiple_choice, options: ["Mới mở","1-2 tháng","3+ tháng"]), đã gặp UV chưa lý do chưa chốt (open)
- Section 3 (Requirements): 3 câu — số năm KN (multiple_choice, options: ["1-2 năm","3+ năm","5+ năm"], aiPrefilled), tech stack (skill_matrix, aiPrefilled), tiếng Anh (multiple_choice, options: ["Đọc hiểu tài liệu kỹ thuật","Giao tiếp với khách hàng nước ngoài","Lead meeting bằng tiếng Anh"], aiPrefilled)
- Section 4 (Culture fit): 2 câu — phong cách làm việc (checkbox_multi, options: ["Tự quản lý tốt, autonomous","Thích được mentor, học hỏi","Move fast, chịu được ambiguity","Process-driven, có cấu trúc"]), thêm về văn hoá (open)
- Section 5 (Package): 2 câu — lương flex (yes_no, aiPrefilled), điều đặc biệt trong team (open)
- Section 6 (Interview process): 3 câu — số vòng (multiple_choice, options: ["2 vòng","3 vòng","4+ vòng"]), có test kỹ thuật (multiple_choice, options: ["Có — take-home assignment","Có — live coding","Không test"]), lịch available (open)
- Section 7 (USP): 3 câu — tại sao UV giỏi nên về (open), grow thế nào 1-2 năm (open), challenge pain point (open)

Pre-fill tất cả câu có aiPrefilled: true dựa trên thông tin trong JD.`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleanRaw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleanRaw) as {
      questions: Question[]
      prefilled_answers: Record<string, unknown>
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any)
      .from('questionnaires')
      .insert({
        jd_history_id: jdHistoryId,
        questions: parsed.questions,
        prefilled_answers: parsed.prefilled_answers,
      })
      .select('id, token')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Lỗi lưu dữ liệu' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, token: data.token })
  } catch (error) {
    console.error('Generate questionnaire error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
