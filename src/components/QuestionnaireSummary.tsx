'use client'

import { useCallback, useMemo } from 'react'
import type { Question } from '@/lib/supabase'

export type QuestionnaireSummaryData = {
  jobTitle: string
  submittedAt: string
  questions: Question[]
  answers: Record<string, unknown>
  token: string
}

type Props = {
  data: QuestionnaireSummaryData
  onPost: () => void
  collapsed?: boolean
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

export default function QuestionnaireSummary({ data, onPost, collapsed = false }: Props) {
  const { jobTitle, submittedAt, questions, answers, token } = data

  // Group questions by section
  const sections = useMemo(
    () =>
      questions.reduce<Record<number, { label: string; questions: Question[] }>>(
        (acc, q) => {
          if (!acc[q.section]) acc[q.section] = { label: q.sectionLabel, questions: [] }
          acc[q.section].questions.push(q)
          return acc
        },
        {}
      ),
    [questions]
  )

  const handlePdf = useCallback(() => {
    const origin = window.location.origin
    window.open(`${origin}/q/${token}/summary`, '_blank')
  }, [token])

  if (collapsed) {
    return (
      <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-green-600 text-sm">✓</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-green-800 truncate">{jobTitle}</p>
            <p className="text-xs text-green-600">Sếp đã điền lúc {formatSubmittedAt(submittedAt)}</p>
          </div>
        </div>
        <button
          onClick={handlePdf}
          className="shrink-0 text-xs text-green-700 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-100 transition-colors"
        >
          🖨 Tải PDF
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
      {/* Header */}
      <div className="bg-green-50 px-5 py-4 border-b border-green-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-green-800">{jobTitle}</p>
            <p className="text-xs text-green-600 mt-0.5">
              Sếp đã điền lúc {formatSubmittedAt(submittedAt)}
            </p>
          </div>
          <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full shrink-0">
            ✓ Hoàn tất
          </span>
        </div>
      </div>

      {/* Answers by section */}
      <div className="px-5 py-4 space-y-5 max-h-[500px] overflow-y-auto">
        {Object.entries(sections)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([sectionNum, { label, questions: sqs }]) => (
            <div key={sectionNum}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                {label}
              </p>
              <div className="space-y-3">
                {sqs.map((q) => (
                  <div key={q.id} className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-600">{q.text}</p>
                    <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-1.5 leading-relaxed">
                      {renderAnswer(q, answers)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Actions */}
      <div className="px-5 pb-5 pt-2 flex gap-2">
        <button
          onClick={handlePdf}
          className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
        >
          🖨 Tải PDF
        </button>
        <button
          onClick={onPost}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Đăng tuyển ngay →
        </button>
      </div>
    </div>
  )
}
