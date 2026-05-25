'use client'

import { useState } from 'react'
import { Question } from '@/lib/supabase'

type Props = {
  questionnaireId: string
  token: string
  questions: Question[]
  prefilledAnswers: Record<string, unknown>
}

const SECTION_LABELS: Record<number, string> = {
  1: 'Outcome of the job',
  2: 'History of the job',
  3: 'Requirement of the job',
  4: 'Culture fit',
  5: 'Package',
  6: 'Interview process',
  7: 'Unique Selling Point',
}

export default function QuestionnaireWizard({
  token,
  questions,
  prefilledAnswers,
}: Props) {
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState<Record<string, unknown>>(prefilledAnswers)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const sections = Array.from({ length: 7 }, (_, i) => i + 1)
  const currentQuestions = questions.filter((q) => q.section === step)
  const totalSections = 7

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function toggleMulti(questionId: string, option: string) {
    const current = (answers[questionId] as string[]) ?? []
    const next = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option]
    setAnswer(questionId, next)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/q/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (res.ok) setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Đã gửi xác nhận!</h2>
          <p className="text-gray-500 text-sm">Recruiter sẽ nhận được câu trả lời của anh/chị và tinh chỉnh lại JD.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="bg-indigo-600 px-6 py-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <span className="font-bold text-sm">J</span>
              </div>
              <span className="font-semibold text-sm">Jane AI</span>
            </div>
            <h1 className="text-xl font-bold mt-1">Xác nhận yêu cầu tuyển dụng</h1>
          </div>

          {/* Progress */}
          <div className="px-6 pt-5 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-indigo-600">
                #{step} · {SECTION_LABELS[step]}
              </span>
              <span className="text-xs text-gray-400">{step} / {totalSections}</span>
            </div>
            <div className="flex gap-1">
              {sections.map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-indigo-600' : 'bg-indigo-100'}`}
                />
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span className="text-amber-500 font-bold text-sm leading-none mt-0.5">✦</span>
              <p className="text-xs text-amber-700">
                Jane đã đọc JD và <span className="font-semibold">điền trước</span> một số ô. Anh/chị chỉ cần xem lại và sửa nếu sai.
              </p>
            </div>
          </div>

          {/* Questions */}
          <div className="px-6 pb-6 pt-4 space-y-4">
            {currentQuestions.map((q) => (
              <div key={q.id} className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-gray-800">{q.text}</p>
                {q.aiPrefilled && (
                  <p className="text-xs text-amber-600">✦ Jane gợi ý — nhấn để sửa</p>
                )}

                {q.type === 'open' && (
                  <textarea
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />
                )}

                {q.type === 'yes_no' && q.options && (
                  <div className="flex gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setAnswer(q.id, opt)}
                        className={`flex-1 rounded-lg py-2.5 text-sm border-2 transition-colors ${
                          answers[q.id] === opt
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-medium'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'multiple_choice' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer border-2 transition-colors ${
                          answers[q.id] === opt
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswer(q.id, opt)}
                          className="text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'checkbox_multi' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const selected = ((answers[q.id] as string[]) ?? []).includes(opt)
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer border-2 transition-colors ${
                            selected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMulti(q.id, opt)}
                            className="text-indigo-600"
                          />
                          <span className="text-sm text-gray-700">{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'skill_matrix' && (
                  <div className="space-y-2">
                    {((answers[q.id] as Array<{ skill: string; level: string }>) ?? []).map(
                      (item, i) => (
                        <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                          <span className="text-sm text-gray-700">{item.skill}</span>
                          <div className="flex gap-1">
                            {['MUST', 'NICE'].map((level) => (
                              <button
                                key={level}
                                onClick={() => {
                                  const updated = [...((answers[q.id] as Array<{ skill: string; level: string }>) ?? [])]
                                  updated[i] = { ...updated[i], level }
                                  setAnswer(q.id, updated)
                                }}
                                className={`text-xs font-bold px-2 py-0.5 rounded border transition-colors ${
                                  item.level === level
                                    ? level === 'MUST'
                                      ? 'text-red-600 bg-red-50 border-red-200'
                                      : 'text-amber-600 bg-amber-50 border-amber-200'
                                    : 'text-gray-400 bg-gray-50 border-gray-200'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Nav */}
            <div className="flex gap-3 pt-2">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-5 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium"
                >
                  ← Quay lại
                </button>
              )}
              {step < totalSections ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Tiếp theo →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi xác nhận →'}
                </button>
              )}
            </div>
            <p className="text-center text-xs text-gray-400">
              Không cần tài khoản · Câu trả lời gửi thẳng cho recruiter
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
