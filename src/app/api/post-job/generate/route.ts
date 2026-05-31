export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import type { ContentStyle, ChannelRecommendation } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Fetch questionnaire answers cho JD này
async function fetchQuestionnaireContext(jdHistoryId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  const { data: q } = await supabase
    .from('questionnaires')
    .select('id')
    .eq('jd_history_id', jdHistoryId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!q) return ''

  const { data: ans } = await supabase
    .from('questionnaire_answers')
    .select('answers')
    .eq('questionnaire_id', q.id)
    .single()

  if (!ans?.answers) return ''

  // Extract relevant fields từ answers
  const a = ans.answers as Record<string, unknown>
  const lines: string[] = []

  // Seniority/experience (section 3)
  if (a['req_1']) lines.push(`Yêu cầu kinh nghiệm: ${a['req_1']}`)

  // Skills (skill_matrix)
  if (Array.isArray(a['req_2'])) {
    const skills = (a['req_2'] as Array<{skill: string; level: string}>)
      .map(s => `${s.skill} (${s.level})`)
      .join(', ')
    lines.push(`Kỹ năng: ${skills}`)
  }

  // Team highlight / USP (section 5, 7)
  if (a['pkg_2']) lines.push(`Điểm hấp dẫn của team: ${a['pkg_2']}`)
  if (a['usp_1']) lines.push(`Lý do ứng viên nên chọn: ${a['usp_1']}`)
  if (a['usp_2']) lines.push(`Cơ hội phát triển: ${a['usp_2']}`)
  if (a['usp_3']) lines.push(`Thách thức lớn nhất: ${a['usp_3']}`)

  // Salary flexibility
  if (a['pkg_1']) lines.push(`Lương: ${a['pkg_1']}`)

  return lines.join('\n')
}

function buildRecommendPrompt(jobTitle: string, jdText: string, questionnaireContext: string): string {
  return `Bạn là chuyên gia tuyển dụng. Phân tích JD và trả về JSON channel recommendation.

**Vị trí:** ${jobTitle}
**JD:**
${jdText}
${questionnaireContext ? `\n**Thông tin bổ sung từ hiring manager:**\n${questionnaireContext}` : ''}

---

Hãy:
1. Xác định job_type: 'tech' | 'business' | 'marketing' | 'other'
2. Xác định seniority: 'fresher' (0 năm, intern) | 'junior' (1-3 năm) | 'senior' (3+ năm) | 'manager'
3. Rank 4 kênh theo độ phù hợp dựa trên job_type × seniority:
   - Fresher/Intern: Facebook Group mạnh nhất, TopCV có đăng free
   - Junior: Facebook Group + LinkedIn cân bằng
   - Senior/Manager: LinkedIn dominant
   - Tech: LinkedIn + Facebook dev community
   - Business/BD: LinkedIn + TopCV
   - Marketing: Facebook Group + LinkedIn

Trả về JSON duy nhất, không thêm text:

{
  "job_type": "tech",
  "seniority": "senior",
  "channel_recommendations": [
    {"channel": "linkedin", "stars": 3, "reason": "Senior dev chủ động tìm job qua LinkedIn"},
    {"channel": "facebook", "stars": 2, "reason": "Cộng đồng dev VN active, nhưng senior ít hơn"},
    {"channel": "threads", "stars": 2, "reason": "Đang lên, pool còn nhỏ"},
    {"channel": "topcv", "stars": 2, "reason": "Volume cao, phù hợp đăng thêm"}
  ]
}`
}

const STYLE_DESCRIPTIONS: Record<ContentStyle, string> = {
  announcement: 'Thông báo tuyển dụng chuyên nghiệp. Header rõ ràng → 2 câu hook → bullets (công việc/yêu cầu/quyền lợi) → CTA.',
  story_telling: 'HR kể chuyện cá nhân về team/công ty. Bắt đầu bằng câu chuyện thật, dẫn dắt tự nhiên vào JD. Cảm xúc, gần gũi.',
  benefit_focus: 'Hook bằng con số/quyền lợi cụ thể ngay đầu (lương, thưởng, cơ hội). Liệt kê đặc quyền trước yêu cầu.',
  seeding: 'Viết như đang chia sẻ tự nhiên, KHÔNG dùng từ "tuyển dụng"/"apply"/"ứng tuyển" trong 2 câu đầu. Casual, như bạn bè nhắn tin.',
  trending_funny: 'Hook bất ngờ, bắt trend hoặc dùng góc nhìn hài hước để phá rào cản. Phù hợp khi job có điểm bất lợi cần giảm nhẹ.',
}

const CHANNEL_RULES: Record<string, string> = {
  linkedin: 'Dài 150-250 từ. Emoji chừng mực (tối đa 3). Tone chuyên nghiệp. 125 ký tự đầu phải hook.',
  facebook: 'Dài 80-150 từ. 3 dòng đầu (125 ký tự) phải hook mạnh vì đây là phần hiển thị trước "Xem thêm". Emoji thoải mái hơn. Casual.',
  threads: 'Tối đa 450 ký tự. 1 câu hook + 3 bullet siêu ngắn + 1 dòng CTA.',
  topcv: 'Full JD format chuẩn: Mô tả vị trí → Trách nhiệm → Yêu cầu (must have / nice to have rõ ràng) → Quyền lợi → Liên hệ. Formal, đầy đủ.',
}

function buildGeneratePrompt(
  jobTitle: string,
  jdText: string,
  questionnaireContext: string,
  channel: string,
  style: ContentStyle
): string {
  return `Bạn là chuyên gia content tuyển dụng. Viết nội dung post job cho kênh ${channel}.

**Vị trí:** ${jobTitle}
**JD:**
${jdText}
${questionnaireContext ? `\n**Thông tin bổ sung từ hiring manager:**\n${questionnaireContext}` : ''}

---

**Kênh:** ${channel}
**Rules của kênh:** ${CHANNEL_RULES[channel] ?? ''}

**Style yêu cầu:** ${style}
**Mô tả style:** ${STYLE_DESCRIPTIONS[style]}

---

Chỉ trả về nội dung post, không giải thích, không markdown wrapper.`
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkRateLimit(userId, 'post-job/generate')
  if (!allowed) {
    return NextResponse.json(
      { error: 'Bạn đã đạt giới hạn 20 lần tạo content mỗi ngày. Thử lại vào ngày mai.' },
      { status: 429 }
    )
  }

  try {
    const body = await req.json() as {
      jd_history_id: string
      mode?: 'recommend' | 'generate'
      channel?: string
      style?: ContentStyle
    }

    const { jd_history_id, mode = 'recommend', channel, style } = body

    if (!jd_history_id) {
      return NextResponse.json({ error: 'Thiếu jd_history_id' }, { status: 400 })
    }

    // Fetch JD (admin key — anon key blocked by RLS on jd_history)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jd, error: jdError } = await (getSupabaseAdmin() as any)
      .from('jd_history')
      .select('job_title, generated_jd')
      .eq('id', jd_history_id)
      .single()

    if (jdError || !jd) {
      return NextResponse.json({ error: 'Không tìm thấy JD' }, { status: 404 })
    }

    const questionnaireContext = await fetchQuestionnaireContext(jd_history_id)

    // MODE: recommend — chỉ classify + rank kênh
    if (mode === 'recommend') {
      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 800,
        messages: [{ role: 'user', content: buildRecommendPrompt(jd.job_title, jd.generated_jd, questionnaireContext) }],
      })

      const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
      const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      let result: { job_type: string; seniority: string; channel_recommendations: ChannelRecommendation[] }
      try {
        result = JSON.parse(clean)
      } catch (e) {
        console.error('Recommend JSON parse failed. Raw:', raw)
        return NextResponse.json({ error: 'Phân tích kênh thất bại' }, { status: 500 })
      }

      return NextResponse.json({ recommendations: result })
    }

    // MODE: generate — gen content cho 1 kênh với style
    if (mode === 'generate') {
      if (!channel || !style) {
        return NextResponse.json({ error: 'Thiếu channel hoặc style' }, { status: 400 })
      }

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: buildGeneratePrompt(jd.job_title, jd.generated_jd, questionnaireContext, channel, style)
        }],
      })

      const content = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''

      // Upsert campaign draft
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campaign, error: upsertError } = await (getSupabaseAdmin() as any)
        .from('post_campaigns')
        .upsert(
          { jd_history_id, channel, content, status: 'draft' },
          { onConflict: 'jd_history_id,channel' }
        )
        .select()
        .single()

      if (upsertError) {
        console.error('Upsert campaign error:', upsertError)
        return NextResponse.json({ error: 'Lưu content thất bại' }, { status: 500 })
      }

      return NextResponse.json({ campaign })
    }

    return NextResponse.json({ error: 'Mode không hợp lệ' }, { status: 400 })
  } catch (error) {
    console.error('Generate posts error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
