'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { UserButton } from '@clerk/nextjs'
import { JdHistory } from '@/lib/supabase'
import FeedbackWidget from '@/components/FeedbackWidget'
import PostingCard from '@/components/PostingCard'
import QuestionnaireSummary from '@/components/QuestionnaireSummary'
import type { QuestionnaireSummaryData } from '@/components/QuestionnaireSummary'

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
  const [history, setHistory] = useState<Pick<JdHistory, 'id' | 'job_title' | 'created_at' | 'status'>[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Questionnaire flow
  const [questionnaireToken, setQuestionnaireToken] = useState<string | null>(null)
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null)
  const [generatingQ, setGeneratingQ] = useState(false)
  const [questionnaireLanguage, setQuestionnaireLanguage] = useState<'vi' | 'en'>('vi')
  const [generatedLanguage, setGeneratedLanguage] = useState<'vi' | 'en'>('vi')
  const [activeJdHistoryId, setActiveJdHistoryId] = useState<string | null>(null)
  const [postingJdId, setPostingJdId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showAnswersReadyToast, setShowAnswersReadyToast] = useState(false)
  const [answersData, setAnswersData] = useState<QuestionnaireSummaryData | null>(null)

  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [urlError, setUrlError] = useState('')

  const [reminders, setReminders] = useState<{ jd_history_id: string; job_title: string }[]>([])
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const [resendingFor, setResendingFor] = useState<string | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  function isUrl(value: string) {
    try {
      const u = new URL(value.trim())
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  async function handleJdInput(value: string) {
    setPastedJd(value)
    setUrlError('')
    if (!isUrl(value)) return
    setFetchingUrl(true)
    try {
      const res = await fetch('/api/fetch-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value.trim() }),
      })
      const data = await res.json()
      if (data.text) {
        setPastedJd(data.text)
      } else {
        setUrlError(data.error ?? 'Không đọc được nội dung từ link này')
      }
    } catch {
      setUrlError('Không kết nối được, thử lại nhé')
    } finally {
      setFetchingUrl(false)
    }
  }

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

  useEffect(() => {
    fetch('/api/reminders')
      .then((r) => r.json())
      .then((d) => { if (d.reminders) setReminders(d.reminders) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth_success') || params.get('oauth_error')) {
      window.history.replaceState({}, '', '/app')
    }
  }, [])

  // Auto-poll: notify recruiter when HM submits answers
  const toastShownRef = useRef(false)
  useEffect(() => {
    if (!questionnaireId) return
    if (answersData) return  // already loaded — don't re-subscribe
    toastShownRef.current = false  // reset when questionnaire changes

    const controller = new AbortController()
    let intervalId: ReturnType<typeof setInterval>

    async function checkAnswers() {
      try {
        const res = await fetch(`/api/questionnaire/${questionnaireId}/summary`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json() as QuestionnaireSummaryData
        // Runtime guard: ensure we got a real summary, not a partial object
        if (!data || !data.answers) return
        setAnswersData(data)
        // Show toast only once
        if (!toastShownRef.current) {
          toastShownRef.current = true
          setShowAnswersReadyToast(true)
          setTimeout(() => setShowAnswersReadyToast(false), 5000)
        }
        // Stop polling — no need to keep checking
        clearInterval(intervalId)
      } catch {
        // AbortError and network errors are silently swallowed
      }
    }

    checkAnswers()
    intervalId = setInterval(checkAnswers, 30000)
    return () => {
      controller.abort()
      clearInterval(intervalId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionnaireId])  // intentionally excludes answersData — the if-guard handles it

  async function handleHistoryClick(id: string) {
    try {
      const res = await fetch(`/api/history/${id}`)
      const data = await res.json()
      if (data.item) {
        setPastedTitle(data.item.job_title)
        setPastedJd(data.item.generated_jd)
        setJobTitle(data.item.job_title)
        setRawInput(data.item.raw_input ?? '')
        setActiveJdHistoryId(data.item.id)
        setQuestionnaireToken(data.item.questionnaire_token ?? null)
        setQuestionnaireId(data.item.questionnaire_id ?? null)
        setAnswersData(null)
        setPostingJdId(null)
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
    setAnswersData(null)
    try {
      const res = await fetch('/api/questionnaire/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText: pastedJd, jobTitle: pastedTitle.trim() || undefined, language: questionnaireLanguage }),
      })
      const data = await res.json() as { token?: string; id?: string; jd_history_id?: string; error?: string }
      if (data.token) {
        setQuestionnaireToken(data.token)
        setQuestionnaireId(data.id ?? null)
        setGeneratedLanguage(questionnaireLanguage)
        setActiveJdHistoryId(data.jd_history_id ?? null)
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

  async function handleMarkHired(jdHistoryId: string) {
    try {
      const res = await fetch(`/api/jd-history/${jdHistoryId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'hired' }),
      })
      if (!res.ok) throw new Error('Failed')
      setDismissedReminders((prev) => new Set([...prev, jdHistoryId]))
      setHistory((prev) => prev.map((h) => h.id === jdHistoryId ? { ...h, status: 'hired' as const } : h))
    } catch {
      alert('Không thể cập nhật trạng thái, thử lại nhé!')
    }
  }

  async function handleResendQuestionnaire(jdHistoryId: string) {
    setResendingFor(jdHistoryId)
    try {
      const res = await fetch('/api/questionnaire/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_history_id: jdHistoryId }),
      })
      const data = await res.json() as { token?: string; id?: string; jd_history_id?: string; error?: string }
      if (data.token) {
        setQuestionnaireToken(data.token)
        setQuestionnaireId(data.id ?? null)
        setActiveJdHistoryId(jdHistoryId)
        setAnswersData(null)
        setDismissedReminders((prev) => new Set([...prev, jdHistoryId]))
        fetchHistory()
      } else {
        alert('Có lỗi khi tạo bảng hỏi mới: ' + (data.error ?? ''))
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setResendingFor(null)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      {/* 30-day reminder banners */}
      {reminders.filter((r) => !dismissedReminders.has(r.jd_history_id)).length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 flex flex-col gap-2">
          {reminders
            .filter((r) => !dismissedReminders.has(r.jd_history_id))
            .map((r) => (
              <div key={r.jd_history_id} className="bg-white border border-amber-300 rounded-xl shadow-lg px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800">
                    <span className="text-amber-500 mr-1">⏰</span>
                    <span className="font-bold">{r.job_title}</span> — đã 1 tháng rồi, tuyển được chưa?
                  </p>
                  <button
                    onClick={() => setDismissedReminders((prev) => new Set([...prev, r.jd_history_id]))}
                    className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMarkHired(r.jd_history_id)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                  >
                    ✓ Đã tuyển xong
                  </button>
                  <button
                    onClick={() => handleResendQuestionnaire(r.jd_history_id)}
                    disabled={resendingFor === r.jd_history_id}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {resendingFor === r.jd_history_id ? 'Đang tạo...' : '↻ Gửi bảng hỏi mới'}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Answers ready banner */}
      {showAnswersReadyToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg">
          <span className="text-lg">🎉</span>
          <span className="text-sm font-semibold">Sếp vừa điền xong! Xem answers bên dưới ↓</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{background: '#1a2e6e'}}>
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-none">Jane AI</h1>
              <p className="text-xs text-gray-500">the Recruiter</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Lịch sử ({history.length})
          </button>
          <UserButton />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        {/* History dropdown */}
        {showHistory && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">JD đã tạo</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Chưa có JD nào</p>
              ) : (
                <>
                  {/* Active JDs */}
                  {history.filter((h) => (h.status ?? 'active') === 'active').map((item) => (
                    <div key={item.id} className="flex items-center border-b border-gray-50 last:border-0">
                      <button
                        onClick={() => handleHistoryClick(item.id)}
                        className="flex-1 text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                      >
                        <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                      </button>
                      <button
                        onClick={() => { handleResendQuestionnaire(item.id); setShowHistory(false) }}
                        disabled={resendingFor === item.id}
                        className="px-2 py-1 mr-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap disabled:opacity-50"
                      >
                        {resendingFor === item.id ? '...' : '↻'}
                      </button>
                      <button
                        onClick={() => { setPostingJdId(item.id); setShowHistory(false) }}
                        className="px-3 py-1 mr-3 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
                      >
                        Đăng tuyển
                      </button>
                    </div>
                  ))}

                  {/* Hired JDs */}
                  {history.filter((h) => h.status === 'hired').length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Đã tuyển xong</p>
                      </div>
                      {history.filter((h) => h.status === 'hired').map((item) => (
                        <div key={item.id} className="flex items-center opacity-60">
                          <button
                            onClick={() => handleHistoryClick(item.id)}
                            className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                          >
                            <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                          </button>
                          <span className="px-3 mr-3 text-xs text-green-600 font-medium">✓ Hired</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Card chính: Paste JD */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Bạn đang tuyển vị trí gì?</h2>
            <p className="text-xs text-gray-400">Nếu đã có JD thì paste vào đây — Jane sẽ gợi ý bước tiếp theo. Chưa có JD thì dùng phần gợi ý bên dưới.</p>
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
          <div className="relative">
            <textarea
              value={pastedJd}
              onChange={(e) => handleJdInput(e.target.value)}
              rows={10}
              disabled={fetchingUrl}
              placeholder={'Paste JD hoặc link tuyển dụng vào đây...\n\nVD:\nhttps://filum.talent.vn/careers/job/...\n\nhoặc paste thẳng nội dung JD:\nSenior Frontend Developer\nCông ty ABC đang tìm kiếm...'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
            />
            {fetchingUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
                <div className="flex items-center gap-2 text-indigo-600 text-sm font-medium">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang đọc JD từ link...
                </div>
              </div>
            )}
          </div>
          {urlError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{urlError} — hãy copy paste nội dung JD trực tiếp nhé.</p>
          )}
          <div className="flex gap-2">
            {(['vi', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setQuestionnaireLanguage(lang)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  questionnaireLanguage === lang
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
              </button>
            ))}
          </div>
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
                <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                  generatedLanguage === 'en'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {generatedLanguage === 'en' ? '🇬🇧 EN' : '🇻🇳 VN'}
                </span>
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
              <div className="flex gap-2 mt-2">
                <a
                  href={`${origin}/q/${questionnaireToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg py-2 hover:bg-indigo-50 transition-colors"
                >
                  Xem bảng hỏi →
                </a>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Gửi link này cho sếp qua Zalo/email — không cần đăng nhập</p>
            </div>

            {/* Waiting for HM / Done indicator */}
            {!answersData ? (
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
                <p className="text-xs text-gray-400 text-center">
                  Đang chờ sếp điền bảng hỏi... (Jane sẽ tự báo khi sếp xong)
                </p>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-2.5 flex items-center gap-2">
                <span className="text-green-600 text-base">✓</span>
                <p className="text-xs font-medium text-green-700">Sếp đã điền xong — xem answers bên dưới</p>
              </div>
            )}
          </div>
        )}

        {/* Questionnaire Summary + Posting flow */}
        {answersData && (
          <div className="max-w-2xl mx-auto space-y-3">
            <QuestionnaireSummary
              data={answersData}
              collapsed={!!postingJdId}
              onPost={() => { if (activeJdHistoryId) setPostingJdId(activeJdHistoryId) }}
            />
            {postingJdId && (
              <PostingCard jdHistoryId={postingJdId} />
            )}
          </div>
        )}

        {/* Posting Card (from history, no summary context) */}
        {!answersData && postingJdId && (
          <PostingCard jdHistoryId={postingJdId} />
        )}
      </div>
    </div>
    <FeedbackWidget />
    </>
  )
}
