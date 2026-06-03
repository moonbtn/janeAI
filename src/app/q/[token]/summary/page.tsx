import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Question } from '@/lib/supabase'
import PrintTrigger from './PrintTrigger'
import PrintButton from './PrintButton'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: q } = await (getSupabaseAdmin() as any)
    .from('questionnaires')
    .select('jd_history_id')
    .eq('token', token)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jd } = q ? await (getSupabaseAdmin() as any)
    .from('jd_history')
    .select('job_title')
    .eq('id', q.jd_history_id)
    .single() : { data: null }
  const jobTitle = jd?.job_title ?? 'Hiring Brief'
  return { title: `Jane AI - ${jobTitle}` }
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    weekday: 'long',
  })
}

function renderAnswer(question: Question, answers: Record<string, unknown>): string {
  const value = answers[question.id]
  if (value == null) return '(chưa trả lời)'

  if (question.type === 'skill_matrix' && Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'object' && v !== null && 'skill' in v) {
          const s = v as { skill?: string; level?: string }
          if (typeof s.skill !== 'string') return String(v)
          return s.level ? `${s.skill} [${s.level}]` : s.skill
        }
        return String(v)
      })
      .join(' · ')
  }

  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

export default async function SummaryPrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: q } = await (getSupabaseAdmin() as any)
    .from('questionnaires')
    .select('id, questions, jd_history_id')
    .eq('token', token)
    .single()

  if (!q) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jd } = await (getSupabaseAdmin() as any)
    .from('jd_history')
    .select('job_title')
    .eq('id', q.jd_history_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ans } = await (getSupabaseAdmin() as any)
    .from('questionnaire_answers')
    .select('answers, submitted_at')
    .eq('questionnaire_id', q.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!ans) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Sếp chưa điền bảng hỏi này.
      </div>
    )
  }

  const questions = q.questions as Question[]
  const answers = ans.answers as Record<string, unknown>
  const jobTitle = jd?.job_title ?? 'Không rõ vị trí'

  const sections = questions.reduce<Record<number, { label: string; questions: Question[] }>>(
    (acc, question) => {
      if (!acc[question.section]) {
        acc[question.section] = { label: question.sectionLabel, questions: [] }
      }
      acc[question.section].questions.push(question)
      return acc
    },
    {}
  )

  return (
    <>
      <PrintTrigger />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
          .page-break { page-break-before: always; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Print button — hidden when printing */}
        <div className="no-print flex justify-end mb-6">
          <PrintButton />
        </div>

        {/* Document header */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Jane AI · Hiring Brief</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{jobTitle}</h1>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Submitted: {formatSubmittedAt(ans.submitted_at)}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-7">
          {Object.entries(sections)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([sectionNum, { label, questions: sqs }]) => (
              <div key={sectionNum}>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-1 mb-3">
                  {label}
                </h2>
                <div className="space-y-4">
                  {sqs.map((question) => (
                    <div key={question.id}>
                      <p className="text-xs font-semibold text-gray-500 mb-1">{question.text}</p>
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {renderAnswer(question, answers)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">Generated by Jane AI · jane-ai.app</p>
        </div>
      </div>
    </>
  )
}
