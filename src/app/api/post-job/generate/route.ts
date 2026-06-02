export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import type { ContentStyle, ChannelRecommendation } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type StoryAngle =
  | 'peer_pressure'
  | 'hidden_gem'
  | 'challenge_reframe'
  | 'career_pivot'
  | 'insider_scoop'
  | 'urgency_moment'

interface CandidatePersona {
  motivation: string
  barrier: string
  trigger: string
}

function getCandidatePersona(jobType: string, seniority: string): CandidatePersona {
  const key = `${jobType}:${seniority}`
  const map: Record<string, CandidatePersona> = {
    'tech:fresher': {
      motivation: 'Học skill thật, có lương part-time, bước chân đầu vào ngành',
      barrier: 'Chưa biết công ty, process tuyển dụng có vẻ gắt, không chắc đủ tiêu chuẩn',
      trigger: 'Sắp ra trường, cần kinh nghiệm thực tế để không bị gap',
    },
    'tech:junior': {
      motivation: 'Tech stack xịn hơn, mentor tốt, grow nhanh hơn chỗ cũ',
      barrier: 'Công ty nhỏ hơn big tech, ít brand name',
      trigger: 'Job cũ không còn challenge, cảm giác mình đang đứng yên',
    },
    'tech:senior': {
      motivation: 'Ownership cao, impact rộng hơn, làm được quyết định kiến trúc',
      barrier: 'Brand không đủ lớn để biện minh với bản thân, lương cần cạnh tranh với big tech',
      trigger: 'Bị cap technical ở job cũ, làm mãi một kiểu không thấy grow',
    },
    'tech:manager': {
      motivation: 'Build team thật sự, có product vision rõ ràng, tự quyết hiring',
      barrier: 'Scope role không rõ, sợ downgrade từ tech sang management thuần',
      trigger: 'Muốn lead thật sự chứ không chỉ là senior code nhiều nhất',
    },
    'business:fresher': {
      motivation: 'Học sales/BD thực chiến, không chỉ chạy admin cho senior',
      barrier: 'Lương thấp hơn MT program của Unilever/Pepsico, brand nhỏ hơn',
      trigger: 'Chưa có kinh nghiệm nên cần chỗ chịu train, không muốn làm bừa',
    },
    'business:junior': {
      motivation: 'Thăng tiến nhanh, exposure thị trường quốc tế, ownership deal',
      barrier: 'Ngành hoặc công ty ít tên tuổi, khó explain với bạn bè',
      trigger: 'Job cũ không có lộ trình rõ, làm 2 năm vẫn ở vị trí cũ',
    },
    'business:senior': {
      motivation: 'P&L ownership, mở thị trường mới, tự build team',
      barrier: 'Brand chưa đủ lớn để justify chuyển từ công ty hiện tại',
      trigger: 'Muốn thử challenge mới, job cũ đã comfortable quá mức',
    },
    'business:manager': {
      motivation: 'Chiến lược thật sự, không chỉ execute, có tiếng nói với C-level',
      barrier: 'Rủi ro cao khi chuyển sang công ty nhỏ hơn',
      trigger: 'Job cũ chính trị nhiều, execution không đi đến đâu',
    },
    'marketing:fresher': {
      motivation: 'Làm campaign thật, hiểu product side, không chỉ support designer',
      barrier: 'Agency quen rồi, in-house culture khác, sợ boring',
      trigger: 'Muốn ownership, mệt làm cho brief của client rồi',
    },
    'marketing:junior': {
      motivation: 'Creative freedom, data-driven culture, budget thật để chạy',
      barrier: 'Budget nhỏ hơn agency lớn, ít prestige',
      trigger: 'Muốn ownership thật sự, không chỉ execute brief',
    },
    'marketing:senior': {
      motivation: 'Brand building từ đầu, cross-function collaboration, region scope',
      barrier: 'Công ty không có brand marketing đủ mạnh để học hỏi',
      trigger: 'Job cũ stagnant, làm đi làm lại campaign format cũ',
    },
    'marketing:manager': {
      motivation: 'Xây team, chiến lược dài hạn, budget lớn hơn',
      barrier: 'Leadership chưa tin tưởng marketing đủ để cho budget',
      trigger: 'Muốn chứng minh marketing là growth driver, không chỉ cost center',
    },
  }

  return (
    map[key] ??
    map[`${jobType}:junior`] ?? {
      motivation: 'Tìm môi trường tốt hơn, học được nhiều hơn',
      barrier: 'Chưa biết rõ văn hóa công ty',
      trigger: 'Job hiện tại không còn phù hợp',
    }
  )
}

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

function pickStoryAngle(
  jobType: string,
  seniority: string,
  questionnaireContext: string
): StoryAngle {
  const weights: Record<StoryAngle, number> = {
    peer_pressure: 1,
    hidden_gem: 1,
    challenge_reframe: 1,
    career_pivot: 1,
    insider_scoop: 1,
    urgency_moment: 1,
  }

  // Boost based on job context
  if (['senior', 'manager'].includes(seniority) && jobType === 'tech') {
    weights.peer_pressure = 3
  }
  if (questionnaireContext.includes('thách thức') || questionnaireContext.includes('usp_3')) {
    weights.challenge_reframe = 3
  }
  if (questionnaireContext.length > 200) {
    weights.insider_scoop = 3
  }
  if (['junior', 'fresher'].includes(seniority) && jobType === 'business') {
    weights.career_pivot = 3
  }
  if (questionnaireContext.length < 80) {
    weights.hidden_gem = 3
  }

  // Weighted random pick
  const entries = Object.entries(weights) as [StoryAngle, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let rand = Math.random() * total
  for (const [angle, weight] of entries) {
    rand -= weight
    if (rand <= 0) return angle
  }
  return 'urgency_moment'
}

function buildAngleDirective(
  angle: StoryAngle,
  seniority: string,
  questionnaireContext: string
): string {
  const directives: Record<StoryAngle, string> = {
    peer_pressure: `Bắt đầu bằng câu hỏi hoặc tình huống chạm vào self-doubt của ứng viên ${seniority}. Ví dụ: một khoảnh khắc họ tự hỏi mình có đủ giỏi không, có đáng apply không. Sau đó dẫn dắt đến cách role/team này là nơi người như vậy thật ra rất phù hợp.`,

    hidden_gem: `Mở đầu bằng một nghịch lý: điều gì đó về công ty/team mà nghe qua thì không ấn tượng, nhưng khi hiểu rõ lại là lợi thế. Reframe "ít người biết" thành "cơ hội bạn biết trước người khác".`,

    challenge_reframe: `Mở đầu bằng tình huống cụ thể liên quan đến thách thức lớn nhất của role này: "${questionnaireContext.substring(0, 100)}...". Đừng giải thích ngay — để người đọc tự nhận ra mình trong đó. Sau đó reframe tại sao đây chính là lý do nên join, không phải lý do né tránh.`,

    career_pivot: `Kể câu chuyện ngắn về một người đã pivot sang role/ngành này và thấy đây là quyết định đúng. Không cần nêu tên — chỉ cần scenario đủ cụ thể để người đọc thấy mình trong đó. Dẫn vào JD tự nhiên ở cuối.`,

    insider_scoop: `Mở đầu bằng một chi tiết nhỏ, thật, bất ngờ về team hoặc cách làm việc (lấy từ thông tin hiring manager đã cung cấp). Không giải thích chi tiết đó ngay — để nó tự nói lên. Tạo cảm giác người đọc đang được nghe "bí mật nội bộ".`,

    urgency_moment: `Bắt đầu bằng một khoảnh khắc hoặc cảm giác mà ứng viên đang trải qua ngay lúc này — buổi sáng đi làm mà không muốn vào, cuối tuần mà vẫn lo về job, nhìn LinkedIn của người khác mà thấy gì đó. Kết nối cảm giác đó với lý do role này đáng để thử.`,
  }

  return directives[angle]
}

function buildAntiPatternBlock(): string {
  return `
---

**TUYỆT ĐỐI KHÔNG:**
- Mở đầu bằng: "Mình là HR/TA/Recruiter tại...", "Công ty X đang tìm kiếm...", "Chào mọi người..."
- Dùng các cụm: "đội ngũ năng động", "môi trường chuyên nghiệp", "cơ hội phát triển không giới hạn", "work-life balance", "cùng nhau phát triển", "trẻ trung năng động", "môi trường thân thiện", "passionate", "dynamic team"
- Dấu chấm than quá 2 lần trong toàn bài

**BẮT BUỘC:**
- 3 câu đầu KHÔNG được nhắc tên công ty hoặc tên vị trí tuyển dụng
- Câu đầu tiên phải là: câu hỏi, một observation cụ thể, hoặc một tình huống/scenario thật`
}

function buildReplyStarterPrompt(postContent: string): string {
  return `Bạn là recruiter vừa đăng post sau lên Threads:

${postContent}

Viết 2 câu reply ngắn mà recruiter sẽ tự reply vào post trong 30 phút đầu để boost conversation.
Mỗi reply: 1-2 câu, tự nhiên, thêm 1 chi tiết nhỏ về role/team chưa có trong post, hoặc invite người đọc hỏi thêm.
KHÔNG dùng "apply ngay", "DM mình", KHÔNG sales.

Trả về JSON duy nhất, không text thêm: ["reply 1", "reply 2"]`
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
  opinion_hook: '[CHỈ DÙNG TRÊN THREADS] Mở đầu bằng take gây tranh cãi về ngành/nghề liên quan đến role này — một nhận định mà người trong ngành sẽ muốn đồng ý hoặc phản bác. Không nhắc tên công ty/role 3 câu đầu. Kết bằng câu hỏi mở mời người đọc chia sẻ quan điểm.',
  relatable_scenario: '[CHỈ DÙNG TRÊN THREADS] Mở đầu bằng scenario cụ thể mà ứng viên mục tiêu đang sống right now — một khoảnh khắc, cảm giác, hoặc tình huống họ tự thấy mình trong đó ngay lập tức. Không nhắc tên công ty/role 3 câu đầu. Dẫn dắt tự nhiên vào role. Kết bằng câu hỏi mở.',
  insider_drop: '[CHỈ DÙNG TRÊN THREADS] Mở đầu bằng 1 chi tiết nhỏ, thật, bất ngờ về team hoặc cách làm việc (lấy từ thông tin hiring manager đã cung cấp). Tạo cảm giác người đọc đang được nghe "bí mật nội bộ" — không giải thích ngay, để chi tiết đó tự nói lên. Kết bằng câu hỏi mở.',
  english_announcement: '[ENGLISH ONLY] Short, intriguing announcement targeting senior/executive/international candidates. One specific hook line about the role or team → 3-4 ultra-short bullets (role scope, 1-2 hard requirements, 1 thing that makes it interesting) → 1 low-pressure CTA. Goal: give just enough to spark curiosity — the reader should want to search/apply on their own. DO NOT oversell, DO NOT explain too much.',
}

const CHANNEL_RULES: Record<string, string> = {
  linkedin: 'Dài 150-250 từ. Emoji chừng mực (tối đa 3). Tone chuyên nghiệp. 125 ký tự đầu phải hook.',
  facebook: 'Dài 80-150 từ. 3 dòng đầu (125 ký tự) phải hook mạnh vì đây là phần hiển thị trước "Xem thêm". Emoji thoải mái hơn. Casual.',
  threads: 'Tối đa 480 ký tự. KHÔNG dùng bullet. Viết thành đoạn ngắn tự nhiên như người thật đang nói chuyện. Câu cuối PHẢI là câu hỏi mở để kéo reply. Không nhắc tên công ty/vị trí trong 3 câu đầu. Tone: casual, opinionated, như Threads creator — không phải HR đăng job.',
  topcv: 'Full JD format chuẩn: Mô tả vị trí → Trách nhiệm → Yêu cầu (must have / nice to have rõ ràng) → Quyền lợi → Liên hệ. Formal, đầy đủ.',
}

function buildGeneratePrompt(
  jobTitle: string,
  jdText: string,
  questionnaireContext: string,
  channel: string,
  style: ContentStyle,
  persona: CandidatePersona,
  storyAngle?: StoryAngle,
  seniority = ''
): string {
  const personaBlock = `
**Ứng viên mục tiêu:**
- Motivation: ${persona.motivation}
- Barrier (lý do họ chưa apply): ${persona.barrier}
- Trigger (điều gì đang xảy ra khiến họ tìm job): ${persona.trigger}

Bài viết phải address barrier và khai thác trigger — không viết cho mọi người, viết cho đúng người này.`

  const angleBlock =
    style === 'story_telling' && storyAngle
      ? `\n**Góc kể chuyện (bắt buộc theo):** ${buildAngleDirective(storyAngle, seniority, questionnaireContext)}`
      : ''

  return `Bạn là chuyên gia content tuyển dụng. Viết nội dung post job cho kênh ${channel}.

**Vị trí:** ${jobTitle}
**JD:**
${jdText}
${questionnaireContext ? `\n**Thông tin bổ sung từ hiring manager:**\n${questionnaireContext}` : ''}
${personaBlock}
${angleBlock}

---

**Kênh:** ${channel}
**Rules của kênh:** ${style === 'english_announcement' ? 'Write ENTIRELY in English. Max 150 words. No more than 2 emojis (or none). Peer-to-peer tone — not HR-to-candidate. NEVER use: passionate, rockstar, ninja, dynamic team, exciting opportunity, work-life balance. Do not over-explain — assume the reader is smart enough to research on their own.' : CHANNEL_RULES[channel] ?? ''}

**Style yêu cầu:** ${style}
**Mô tả style:** ${STYLE_DESCRIPTIONS[style]}

---

Chỉ trả về nội dung post, không giải thích, không markdown wrapper.
${buildAntiPatternBlock()}`
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

      // Derive job classification from title heuristics
      const jobTitleLower = jd.job_title.toLowerCase()
      const jobType = jobTitleLower.match(/marketing/i)
        ? 'marketing'
        : jobTitleLower.match(/business|bd|sales|account/i)
        ? 'business'
        : jobTitleLower.match(/engineer|developer|dev|backend|frontend|fullstack|data|ml|ai|devops/i)
        ? 'tech'
        : 'other'

      const seniority = jobTitleLower.match(/intern|fresher|graduate/i)
        ? 'fresher'
        : jobTitleLower.match(/junior|jr\./i)
        ? 'junior'
        : jobTitleLower.match(/manager|lead|head|director|vp/i)
        ? 'manager'
        : 'senior'

      const persona = getCandidatePersona(jobType, seniority)
      const storyAngle =
        style === 'story_telling'
          ? pickStoryAngle(jobType, seniority, questionnaireContext)
          : undefined

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: buildGeneratePrompt(
            jd.job_title,
            jd.generated_jd,
            questionnaireContext,
            channel,
            style,
            persona,
            storyAngle,
            seniority
          ),
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

      // Gen reply starters for Threads after upsert — non-critical, fail silently
      let replyStarters: string[] = []
      if (channel === 'threads') {
        try {
          const replyMsg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            messages: [{ role: 'user', content: buildReplyStarterPrompt(content) }],
          })
          const raw = replyMsg.content[0]?.type === 'text' ? replyMsg.content[0].text.trim() : '[]'
          const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          replyStarters = JSON.parse(clean)
        } catch (err) {
          console.error('Reply starters generation failed:', err)
        }
      }

      return NextResponse.json({ campaign, replyStarters })
    }

    return NextResponse.json({ error: 'Mode không hợp lệ' }, { status: 400 })
  } catch (error) {
    console.error('Generate posts error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
