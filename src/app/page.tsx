'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { JdHistory } from '@/lib/supabase'

export default function Home() {
  // Primary state
  const [pastedTitle, setPastedTitle] = useState('')
  const [pastedJd, setPastedJd] = useState('')

  // Draft flow (accordion)
  const [jobTitle, setJobTitle] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [showDraftPanel, setShowDraftPanel] = useState(false)
  const [draftJd, setDraftJd] = useState('')
  const [generatingDraft, setGeneratingDraft] = useState(false)

  // History
  const [history, setHistory] = useState<Pick<JdHistory, 'id' | 'job_title' | 'created_at'>[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Questionnaire flow
  const [questionnaireToken, setQuestionnaireToken] = useState<string | null>(null)
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null)
  const [refinedJd, setRefinedJd] = useState('')
  const [changes, setChanges] = useState<string[]>([])
  const [generatingQ, setGeneratingQ] = useState(false)
  const [refining, setRefining] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notAnsweredYet, setNotAnsweredYet] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showRefinedToast, setShowRefinedToast] = useState(false)

  const refinedJdRef = useRef<HTMLDivElement>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      if (data.history) setHistory(data.history)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  async function handleHistoryClick(id: string) {
    try {
      const res = await fetch(`/api/history/${id}`)
      const data = await res.json()
      if (data.item) {
        setPastedTitle(data.item.job_title)
        setPastedJd(data.item.generated_jd)
        setJobTitle(data.item.job_title)
        setRawInput(data.item.raw_input ?? '')
        setQuestionnaireToken(null)
        setQuestionnaireId(null)
        setAnswers(null)
        setRefinedJd('')
        setChanges([])
        setNotAnsweredYet(false)
        setShowHistory(false)
      }
    } catch {
      alert('Không tải được JD, thử lại nhé!')
    }
  }

  async function handleGenerateDraft() {
    if (!jobTitle.trim() || !rawInput.trim()) return
    setGeneratingDraft(true)
    setDraftJd('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, rawInput }),
      })
      const data = await res.json()
      if (data.generatedJd) {
        setDraftJd(data.generatedJd)
      } else {
        alert('Có lỗi khi gợi ý JD: ' + (data.error ?? ''))
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setGeneratingDraft(false)
    }
  }

  function handleUseDraft() {
    setPastedJd(draftJd)
    setDraftJd('')
    setShowDraftPanel(false)
  }

  async function handleCreateQuestionnaire() {
    if (!pastedJd.trim()) return
    setGeneratingQ(true)
    setQuestionnaireToken(null)
    setQuestionnaireId(null)
    setAnswers(null)
    setRefinedJd('')
    setChanges([])
    setNotAnsweredYet(false)
    try {
      const res = await fetch('/api/questionnaire/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText: pastedJd, jobTitle: pastedTitle.trim() || undefined }),
      })
      const data = await res.json()
      if (data.token) {
        setQuestionnaireToken(data.token)
        setQuestionnaireId(data.id)
        fetchHistory()
      } else {
        alert('Có lỗi khi tạo bảng hỏi: ' + (data.error ?? ''))
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setGeneratingQ(false)
    }
  }

  async function handleCheckAnswers() {
    if (!questionnaireId) return
    setChecking(true)
    setNotAnsweredYet(false)
    try {
      const res = await fetch(`/api/questionnaire/${questionnaireId}/answers`)
      const data = await res.json()
      if (data.answers) {
        setAnswers(data.answers)
      } else {
        setNotAnsweredYet(true)
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setChecking(false)
    }
  }

  async function handleRefineJd() {
    if (!questionnaireId) return
    setRefining(true)
    try {
      const res = await fetch(`/api/questionnaire/${questionnaireId}/refine-jd`, { method: 'POST' })
      const data = await res.json()
      if (data.refinedJd) {
        setRefinedJd(data.refinedJd)
        setChanges(data.changes ?? [])
        setShowRefinedToast(true)
        setTimeout(() => setShowRefinedToast(false), 4000)
        setTimeout(() => refinedJdRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      } else {
        alert('Lỗi: ' + (data.error ?? 'Không rõ nguyên nhân'))
      }
    } catch (e) {
      console.error('Refine error:', e)
      alert('Không kết nối được server, thử lại nhé!')
    } finally {
      setRefining(false)
    }
  }

  function handleConfirmRefinedJd() {
    setPastedJd(refinedJd)
    setRefinedJd('')
    setChanges([])
    fetchHistory()
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {showRefinedToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-semibold">JD đã tinh chỉnh xong! Xem bên dưới 👇</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-none">Jane AI</h1>
              <p className="text-xs text-gray-500">Questionnaire Generator</p>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Lịch sử ({history.length})
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        {/* History dropdown */}
        {showHistory && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">JD đã tạo</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Chưa có JD nào</p>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleHistoryClick(item.id)}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                  >
                    <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Card chính: Paste JD */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Tạo bảng hỏi cho sếp</h2>
            <p className="text-xs text-gray-400">Jane sẽ tự đọc JD và tạo bảng hỏi để sếp xác nhận</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên vị trí</label>
            <input
              type="text"
              value={pastedTitle}
              onChange={(e) => setPastedTitle(e.target.value)}
              placeholder="VD: Senior Frontend Developer"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <textarea
            value={pastedJd}
            onChange={(e) => setPastedJd(e.target.value)}
            rows={10}
            placeholder={'Paste toàn bộ JD vào đây...\n\nVD:\nSenior Frontend Developer\nCông ty ABC đang tìm kiếm...\nYêu cầu: 3+ năm kinh nghiệm React...'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            onClick={handleCreateQuestionnaire}
            disabled={generatingQ || !pastedJd.trim()}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {generatingQ ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang tạo bảng hỏi... (~15s)
              </>
            ) : (
              <>✦ Tạo bảng hỏi cho sếp</>
            )}
          </button>
        </div>

        {/* Accordion: Chưa có JD */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowDraftPanel(!showDraftPanel)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span>Chưa có JD? Để Jane gợi ý draft</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showDraftPanel ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDraftPanel && (
            <div className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vị trí tuyển dụng</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="VD: Senior Frontend Developer"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Yêu cầu thô</label>
                <textarea
                  rows={4}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="3 năm React, tiếng Anh tốt, lương 2000-3000 USD..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft || !jobTitle.trim() || !rawInput.trim()}
                className="w-full border border-indigo-300 text-indigo-600 rounded-lg py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors"
              >
                {generatingDraft ? 'Đang gợi ý...' : 'Gợi ý JD draft →'}
              </button>

              {draftJd && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-amber-700">✦ Jane gợi ý — chưa chính xác</p>
                    <button
                      onClick={handleUseDraft}
                      className="text-xs text-indigo-600 font-medium border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 bg-white"
                    >
                      Dùng draft này →
                    </button>
                  </div>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                    {draftJd}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Questionnaire section */}
        {questionnaireToken && (
          <div className="space-y-3">
            {/* Link */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <p className="text-sm font-medium text-gray-700">Bảng hỏi đã tạo xong</p>
              </div>
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <span className="text-xs text-indigo-700 flex-1 truncate">
                  {origin}/q/{questionnaireToken}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${origin}/q/${questionnaireToken}`)
                    setCopiedLink(true)
                    setTimeout(() => setCopiedLink(false), 2000)
                  }}
                  className={`text-xs font-medium whitespace-nowrap transition-colors ${copiedLink ? 'text-green-600' : 'text-indigo-600'}`}
                >
                  {copiedLink ? '✓ Đã copy!' : 'Copy link'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Gửi link này cho sếp qua Zalo/email — không cần đăng nhập</p>
            </div>

            {/* Answers check */}
            {!answers ? (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <button
                  onClick={handleCheckAnswers}
                  disabled={checking}
                  className="w-full border border-indigo-200 text-indigo-600 rounded-xl py-2.5 text-sm hover:bg-indigo-50 transition-colors disabled:opacity-60"
                >
                  {checking ? 'Đang kiểm tra...' : 'Kiểm tra sếp đã điền chưa'}
                </button>
                {notAnsweredYet && (
                  <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-1.5">
                    Sếp chưa điền, gửi link nhắc sếp nhé 😅
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-green-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-green-800">Sếp đã điền xong!</p>
                </div>
                <button
                  onClick={handleRefineJd}
                  disabled={refining}
                  className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {refining ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang tinh chỉnh... (~15s)
                    </>
                  ) : '✦ Tinh chỉnh JD từ câu trả lời'}
                </button>
              </div>
            )}

            {/* Refined JD */}
            {refinedJd && (
              <div ref={refinedJdRef} className="bg-white rounded-xl border border-indigo-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">JD đề xuất sau tinh chỉnh</p>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Chờ confirm</span>
                </div>
                {changes.length > 0 && (
                  <ul className="space-y-1">
                    {changes.map((c, i) => (
                      <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
                        <span className="text-green-500 mt-0.5 shrink-0">↑</span>{c}
                      </li>
                    ))}
                  </ul>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-4 max-h-60 overflow-y-auto">
                  {refinedJd}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRefinedJd(''); setChanges([]) }}
                    className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50"
                  >
                    Bỏ qua
                  </button>
                  <button
                    onClick={handleConfirmRefinedJd}
                    className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-green-700"
                  >
                    Xác nhận JD mới
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
