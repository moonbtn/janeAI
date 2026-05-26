import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { Question } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { jdText, jobTitle: providedTitle } = await req.json()

    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
      return NextResponse.json({ error: 'Thiếu nội dung JD' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia tuyển dụng. Dựa trên JD sau, hãy:
1. ${providedTitle ? `Dùng tên vị trí đã cho: "${providedTitle}" (không cần extract lại)` : 'Extract tên vị trí tuyển dụng (jobTitle)'}
2. Tạo bảng hỏi 7 nhóm dành cho HIRING MANAGER (sếp trực tiếp), KHÔNG phải HR

Câu hỏi phải là những gì sếp biết và quyết định được: lý do mở vị trí, tiêu chí thực sự, văn hoá team, lịch phỏng vấn, điểm đặc biệt của team. KHÔNG hỏi về gói bảo hiểm, training budget (đó là việc HR).

**JD:**
${jdText}

Trả về JSON theo đúng format sau, không thêm bất kỳ text nào khác:

{
  "jobTitle": "Senior Frontend Developer",
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
- Section 1 (Outcome): 3 câu — vấn đề cần giải quyết (open, aiPrefilled), urgent (yes_no, aiPrefilled), confidential (yes_no, options: ["Tuyển công khai bình thường", "Confidential — không đăng public, tuyển kín"], KHÔNG aiPrefilled — để sếp tự chọn, text câu hỏi: "Vị trí này tuyển công khai hay confidential?")
- Section 2 (History): 2 câu — tuyển bao lâu (multiple_choice, options: ["Mới mở","1-2 tháng","3+ tháng"]), đã gặp UV chưa lý do chưa chốt (open)
- Section 3 (Requirements): 3 câu — số năm KN (multiple_choice, options: ["1-2 năm","3+ năm","5+ năm"], aiPrefilled), tech stack (skill_matrix, aiPrefilled), tiếng Anh (multiple_choice, options: ["Đọc hiểu tài liệu kỹ thuật","Giao tiếp với khách hàng nước ngoài","Lead meeting bằng tiếng Anh"], aiPrefilled)
- Section 4 (Culture fit): 4 câu — 3 cặp trait dạng yes_no (KHÔNG aiPrefilled, sếp tự chọn), 1 câu mở cuối:
  + yes_no, text: "Working style", options: ["Check-in hàng ngày với sếp", "Tự xử lý, báo cáo khi cần"]
  + yes_no, text: "Cách làm việc", options: ["Làm theo spec rõ ràng", "Tự figure out requirements"]
  + yes_no, text: "Môi trường", options: ["Tính ổn định cao", "Pivot nhanh, chịu được chaos"]
  + open, text: "Còn điều gì khác anh/chị muốn ở ứng viên?", KHÔNG aiPrefilled
- Section 5 (Package): 2 câu — lương flex (yes_no, aiPrefilled), điều đặc biệt trong team (open)
- Section 6 (Interview process): 3 câu — số vòng (multiple_choice, options: ["2 vòng","3 vòng","4+ vòng"]), có test kỹ thuật (multiple_choice, options: ["Có — take-home assignment","Có — live coding","Không test"]), lịch available (open)
- Section 7 (USP): 3 câu — tại sao UV giỏi nên về (open), grow thế nào 1-2 năm (open), challenge pain point (open)

Pre-fill tất cả câu có aiPrefilled: true dựa trên thông tin trong JD.`,
        },
      ],
    })

    const firstBlock = message.content[0]
    const raw = firstBlock?.type === 'text' ? firstBlock.text : null
    if (!raw) {
      return NextResponse.json({ error: 'AI không trả về nội dung' }, { status: 502 })
    }
    const cleanRaw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleanRaw) as {
      jobTitle: string
      questions: Question[]
      prefilled_answers: Record<string, unknown>
    }

    if (!parsed.jobTitle || !Array.isArray(parsed.questions) || !parsed.prefilled_answers) {
      return NextResponse.json({ error: 'AI trả về dữ liệu không hợp lệ' }, { status: 502 })
    }

    // Lưu JD vào jd_history trước
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jdRecord, error: jdError } = await (getSupabase() as any)
      .from('jd_history')
      .insert({
        job_title: providedTitle || parsed.jobTitle || 'Không rõ vị trí',
        raw_input: jdText,
        generated_jd: jdText,
      })
      .select('id')
      .maybeSingle()

    if (jdError) {
      console.error('Supabase jd_history error:', jdError)
      return NextResponse.json({ error: 'Lỗi lưu JD' }, { status: 500 })
    }

    if (!jdRecord?.id) {
      console.error('jd_history insert returned no id')
      return NextResponse.json({ error: 'Lỗi lưu JD' }, { status: 500 })
    }

    // Tạo questionnaire linked với jd_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any)
      .from('questionnaires')
      .insert({
        jd_history_id: jdRecord.id,
        questions: parsed.questions,
        prefilled_answers: parsed.prefilled_answers,
      })
      .select('id, token')
      .maybeSingle()

    if (error || !data) {
      console.error('Supabase questionnaire error:', error)
      return NextResponse.json({ error: 'Lỗi lưu bảng hỏi' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, token: data.token })
  } catch (error) {
    console.error('Generate questionnaire error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
