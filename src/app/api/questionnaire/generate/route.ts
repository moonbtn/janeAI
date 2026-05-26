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
      max_tokens: 6000,
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
    "outcome_2": "Bình thường — 2-3 tháng",
    "req_2": [
      {"skill": "React", "level": "MUST"},
      {"skill": "TypeScript", "level": "MUST"},
      {"skill": "Next.js", "level": "NICE"}
    ]
  }
}

LƯU Ý QUAN TRỌNG: Câu loại skill_matrix PHẢI được pre-fill trong prefilled_answers dưới dạng array of objects: [{"skill": "Tên kỹ năng", "level": "MUST"}, ...]. KHÔNG dùng string, KHÔNG bỏ trống. Mức level chỉ dùng "MUST" hoặc "NICE". Chỉ chọn TỐI ĐA 5 kỹ năng quan trọng nhất từ JD — không liệt kê hết tất cả.

Tạo đủ 7 nhóm theo cấu trúc:
- Section 1 (Outcome): 3 câu — vấn đề cần giải quyết (open, aiPrefilled), urgent (yes_no, aiPrefilled), confidential (yes_no, options: ["Tuyển công khai bình thường", "Confidential — không đăng public, tuyển kín"], KHÔNG aiPrefilled — để sếp tự chọn, text câu hỏi: "Vị trí này tuyển công khai hay confidential?")
- Section 2 (History): 2 câu — tuyển bao lâu (multiple_choice, options: ["Mới mở","1-2 tháng","3+ tháng"]), đã gặp UV chưa lý do chưa chốt (open)
- Section 3 (Requirements): 2-3 câu tùy JD:
  + open, aiPrefilled: "JD nêu [X] năm kinh nghiệm — anh/chị có thể linh hoạt không? Minimum thực tế là bao nhiêu?" (thay [X] bằng số năm thực tế trong JD, pre-fill bằng nhận xét từ JD)
  + open, aiPrefilled, CHỈ THÊM NẾU JD có yêu cầu kinh nghiệm management/leadership: "JD yêu cầu [Y] năm kinh nghiệm management — có bắt buộc không? Nếu có, minimum thực tế là bao nhiêu?" (thay [Y] bằng số năm trong JD). Nếu JD KHÔNG đề cập management thì KHÔNG tạo câu này.
  + skill_matrix, aiPrefilled (tech stack)
  + multiple_choice, aiPrefilled, options: ["Cơ bản — đọc được tài liệu kỹ thuật","Giao tiếp được — trao đổi công việc với người nước ngoài","Thành thạo / Song ngữ — viết email, present, lead meeting"] (tiếng Anh)
- Section 4 (Culture fit): 4 câu — 3 cặp trait dạng yes_no (KHÔNG aiPrefilled, sếp tự chọn), 1 câu mở cuối:
  + yes_no, text: "Phong cách làm việc", options: ["Check-in thường xuyên với sếp", "Tự xử lý, báo cáo khi cần"]
  + yes_no, text: "Cách tiếp cận công việc", options: ["Làm theo yêu cầu rõ ràng", "Tự tìm hiểu vấn đề và đề xuất hướng giải quyết"]
  + yes_no, text: "Môi trường phù hợp", options: ["Ổn định, ít thay đổi ưu tiên", "Linh hoạt, chịu được thay đổi nhanh"]
  + open, text: "Còn điều gì khác anh/chị muốn ở ứng viên?", KHÔNG aiPrefilled
- Section 5 (Package): 2 câu — lương và title flex (yes_no, text cố định: "Mức lương và title có flexible không nếu gặp ứng viên xuất sắc?", aiPrefilled), điều đặc biệt trong team (open)
- Section 6 (Interview process): 3 câu — số vòng (multiple_choice, options: ["2 vòng","3 vòng","4+ vòng"]), có test kỹ thuật (multiple_choice, options: ["Có — take-home assignment","Không test"]), lịch available (open)
- Section 7 (USP): 3 câu — tại sao UV giỏi nên về (open), grow thế nào 1-2 năm (open), challenge pain point (open)

Pre-fill tất cả câu có aiPrefilled: true dựa trên thông tin trong JD.

QUAN TRỌNG về prefilled_answers: Phải NGẮN GỌN, tối đa 1-2 câu, viết như câu trả lời của sếp — không phải giải thích, không lặp lại câu hỏi, không nói "cần xác nhận với HM". Ví dụ đúng: "Minimum 6 năm, linh hoạt nếu background tốt". Ví dụ sai: "JD yêu cầu 8+ năm, đây là vị trí cấp cao nên cần xác nhận với hiring manager..."`,
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
