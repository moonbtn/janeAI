import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { Question } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildPrompt(jdText: string, providedTitle: string | undefined, language: 'vi' | 'en'): string {
  if (language === 'en') {
    return `You are a recruitment expert. Based on the following JD, please:
1. ${providedTitle ? `Use the provided job title: "${providedTitle}" (no need to re-extract)` : 'Extract the job title (jobTitle)'}
2. Create a 7-section questionnaire for the HIRING MANAGER (direct supervisor), NOT HR

Questions must cover things the hiring manager knows and decides: reason for opening the role, actual criteria, team culture, interview schedule, team highlights. Do NOT ask about insurance packages, training budget (that is HR's responsibility).

**JD:**
${jdText}

Return JSON in exactly this format, no additional text:

{
  "jobTitle": "Senior Frontend Developer",
  "questions": [
    {
      "id": "outcome_1",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "How did this role come about?",
      "type": "open",
      "aiPrefilled": true
    },
    {
      "id": "outcome_2",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "How urgent is this hire?",
      "type": "yes_no",
      "options": ["Urgent — need someone within 1 month", "Normal — 2-3 months"],
      "aiPrefilled": true
    }
  ],
  "prefilled_answers": {
    "outcome_1": "This role was opened to...",
    "outcome_2": "Normal — 2-3 months",
    "req_2": [
      {"skill": "React", "level": "MUST"},
      {"skill": "TypeScript", "level": "MUST"},
      {"skill": "Next.js", "level": "NICE"}
    ]
  }
}

IMPORTANT — skill_matrix type: prefilled_answers for skill_matrix MUST be an array of objects: [{"skill": "Skill name", "level": "MUST"}, ...]. Do NOT use strings, do NOT leave empty. Level must be "MUST" or "NICE" only. Pick at most 5 most important skills from the JD.

Create all 7 sections as follows:
- Section 1 (Outcome): 3 questions — role origin/how it came about (open, aiPrefilled, fixed text: "How did this role come about?"), urgency (yes_no, aiPrefilled), confidential (yes_no, options: ["Open recruitment — public posting", "Confidential — no public posting"], NOT aiPrefilled, question text: "Is this a public or confidential search?")
- Section 2 (History): 2 questions — how long has the search been ongoing (multiple_choice, options: ["Brand new role","1-2 months","3+ months"]), have candidates been interviewed and why not hired yet (open)
- Section 3 (Requirements): 2-3 questions depending on JD:
  + open, aiPrefilled: "The JD states [X] years of experience — how flexible is that? What is the real minimum?" (replace [X] with actual number from JD, pre-fill with a comment based on JD context)
  + open, aiPrefilled, ONLY if JD mentions management/leadership experience: "The JD requires [Y] years of management experience — is this mandatory? What is the real minimum?" (replace [Y] with actual number). If JD does NOT mention management, skip this question.
  + skill_matrix, aiPrefilled (tech stack from JD)
  + multiple_choice, aiPrefilled, question text: "English proficiency required", options: ["Basic — can read technical docs","Conversational — can communicate with foreign colleagues","Fluent / Bilingual — write emails, present, lead meetings"]
- Section 4 (Culture fit): 4 questions — 3 trait pairs as yes_no (NOT aiPrefilled, manager decides), 1 open question at the end:
  + yes_no, text: "Working style", options: ["Frequent check-ins with manager", "Works independently, reports when needed"]
  + yes_no, text: "Approach to work", options: ["Follows clear instructions", "Proactively identifies problems and proposes solutions"]
  + yes_no, text: "Work environment fit", options: ["Stable, few priority changes", "Flexible, comfortable with fast-changing priorities"]
  + open, text: "Anything else you're looking for in candidates?", NOT aiPrefilled
- Section 5 (Package): 2 questions — salary and title flexibility (yes_no, fixed text: "Is the salary and title flexible for an exceptional candidate?", fixed options: ["Yes — flexible for the right person", "No — budget and title are fixed"], aiPrefilled based on JD context), team highlight (open)
- Section 6 (Interview process): 3 questions — number of rounds (multiple_choice, options: ["2 rounds","3 rounds","4+ rounds"]), technical test (multiple_choice, options: ["Yes — take-home assignment","No test"]), available schedule (open)
- Section 7 (USP): 3 questions — all aiPrefilled: true, pre-fill based on JD content:
  + open, aiPrefilled: "Why should a strong candidate choose your team over another offer?"
  + open, aiPrefilled: "What career growth opportunities will this person have in 1-2 years?"
  + open, aiPrefilled: "What is the biggest challenge of this role?"

Pre-fill all questions with aiPrefilled: true based on information in the JD.

IMPORTANT — prefilled_answers must be SHORT: max 1-2 sentences, written as a manager's direct answer — not an explanation, not repeating the question. Example correct: "Minimum 6 years, flexible with strong background". Example wrong: "The JD requires 8+ years for this senior role, please confirm with hiring manager..."

LANGUAGE: All content — question texts, options, and prefilled_answers — must be written in natural, professional English. Technical tool names (React, Python, SQL, etc.) are fine as-is.`
  }

  return `Bạn là chuyên gia tuyển dụng. Dựa trên JD sau, hãy:
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
- Section 5 (Package): 2 câu — lương và title flex (yes_no, text cố định: "Mức lương và title có linh hoạt không nếu gặp ứng viên xuất sắc?", options cố định: ["Có — linh hoạt nếu gặp ứng viên thực sự tốt", "Không — budget và title đã cố định"], aiPrefilled: chọn 1 trong 2 option tuỳ theo ngữ cảnh JD), điều đặc biệt trong team (open)
- Section 6 (Interview process): 3 câu — số vòng (multiple_choice, options: ["2 vòng","3 vòng","4+ vòng"]), có test kỹ thuật (multiple_choice, options: ["Có — take-home assignment","Không test"]), lịch available (open)
- Section 7 (USP): 3 câu — text câu hỏi cố định, TẤT CẢ đều aiPrefilled: true, pre-fill dựa trên thông tin trong JD:
  + open, aiPrefilled: "Tại sao một ứng viên giỏi nên chọn team anh/chị thay vì offer khác?"
  + open, aiPrefilled: "Trong 1-2 năm tới, người vào vị trí này có cơ hội phát triển như thế nào?"
  + open, aiPrefilled: "Thách thức lớn nhất của vị trí này là gì?"

Pre-fill tất cả câu có aiPrefilled: true dựa trên thông tin trong JD.

QUAN TRỌNG về prefilled_answers: Phải NGẮN GỌN, tối đa 1-2 câu, viết như câu trả lời của sếp — không phải giải thích, không lặp lại câu hỏi, không nói "cần xác nhận với HM". Ví dụ đúng: "Minimum 6 năm, linh hoạt nếu background tốt". Ví dụ sai: "JD yêu cầu 8+ năm, đây là vị trí cấp cao nên cần xác nhận với hiring manager..."

NGÔN NGỮ: Tất cả prefilled_answers phải viết HOÀN TOÀN bằng tiếng Việt. Không dùng từ tiếng Anh trừ tên kỹ thuật/tool (React, Python, SQL, v.v.). Không dùng "flexible", "senior", "junior", "budget", "open", "priority", "urgent" hay bất kỳ từ tiếng Anh thông thường nào — thay bằng tiếng Việt tương đương.`
}

export async function POST(req: NextRequest) {
  try {
    const { jdText, jobTitle: providedTitle, language = 'vi' } = await req.json() as {
      jdText: string
      jobTitle?: string
      language?: 'vi' | 'en'
    }

    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
      return NextResponse.json({ error: 'Thiếu nội dung JD' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: buildPrompt(jdText, providedTitle, language),
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any)
      .from('questionnaires')
      .insert({
        jd_history_id: jdRecord.id,
        questions: parsed.questions,
        prefilled_answers: parsed.prefilled_answers,
        language,
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
