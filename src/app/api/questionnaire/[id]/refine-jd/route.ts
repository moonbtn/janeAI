export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'

const client = new Anthropic()

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: q, error: qError } = await getSupabase()
    .from('questionnaires')
    .select('jd_history_id, questions')
    .eq('id', id)
    .single()

  if (qError || !q) {
    return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  }

  const { data: jd } = await getSupabase()
    .from('jd_history')
    .select('job_title, generated_jd')
    .eq('id', q.jd_history_id)
    .single()

  const { data: ans } = await getSupabase()
    .from('questionnaire_answers')
    .select('answers')
    .eq('questionnaire_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!jd || !ans) {
    return NextResponse.json({ error: 'Thiếu dữ liệu để tinh chỉnh' }, { status: 400 })
  }

  const questionsText = (q.questions as Array<{ id: string; text: string }>)
    .map((q) => {
      const answer = (ans.answers as Record<string, unknown>)[q.id]
      return `Q: ${q.text}\nA: ${Array.isArray(answer) ? answer.join(', ') : answer ?? '(không trả lời)'}`
    })
    .join('\n\n')

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2500,
    messages: [
      {
        role: 'user',
        content: `Bạn là chuyên gia viết JD. Dựa trên JD gốc và câu trả lời của hiring manager, hãy tinh chỉnh lại JD cho chính xác hơn.

**JD gốc (${jd.job_title}):**
${jd.generated_jd}

**Câu trả lời của hiring manager:**
${questionsText}

Hãy:
1. Cập nhật JD dựa trên thông tin mới từ hiring manager
2. Giữ nguyên cấu trúc và phong cách JD gốc
3. Chỉ thay đổi những gì có thông tin mới từ hiring manager

Trả về JSON:
{
  "refinedJd": "nội dung JD đã tinh chỉnh",
  "changes": [
    "Cập nhật yêu cầu kinh nghiệm từ X thành Y vì...",
    "Thêm thông tin về tech stack..."
  ]
}`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
  const result = JSON.parse(raw) as { refinedJd: string; changes: string[] }

  return NextResponse.json(result)
}
