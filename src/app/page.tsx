'use client'

import { useState, useEffect, useRef } from 'react'
import { JdHistory } from '@/lib/supabase'

export default function Home() {
  const [jobTitle, setJobTitle] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [generatedJd, setGeneratedJd] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<Pick<JdHistory, 'id' | 'job_title' | 'created_at'>[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [questionnaireToken, setQuestionnaireToken] = useState<string | null>(null)
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null)
  const [refinedJd, setRefinedJd] = useState('')
  const [changes, setChanges] = useState<string[]>([])
  const [generatingQ, setGeneratingQ] = useState(false)
  const [refining, setRefining] = useState(false)
  const [currentJdHistoryId, setCurrentJdHistoryId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [checking, setChecking] = useState(false)
  const refinedJdRef = useRef<HTMLDivElement>(null)
  const [notAnsweredYet, setNotAnsweredYet] = useState(false)

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      if (data.history) setHistory(data.history)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleGenerate() {
    if (!jobTitle.trim() || !rawInput.trim()) return
    setLoading(true)
    setGeneratedJd('')
    setQuestionnaireToken(null)
    setQuestionnaireId(null)
    setAnswers(null)
    setRefinedJd('')
    setChanges([])
    setCurrentJdHistoryId(null)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, rawInput }),
      })
      const data = await res.json()
      if (data.generatedJd) {
        setGeneratedJd(data.generatedJd)
        setCurrentJdHistoryId(data.jdHistoryId ?? null)
        fetchHistory()
      } else {
        setGeneratedJd('Có lỗi xảy ra: ' + data.error)
      }
    } catch {
      setGeneratedJd('Không kết nối được, thử lại nhé!')
    } finally {
      setLoading(false)
    }
  }

  async function handleHistoryClick(id: string) {
    const res = await fetch(`/api/history/${id}`)
    const data = await res.json()
    if (data.item) {
      setGeneratedJd(data.item.generated_jd)
      setJobTitle(data.item.job_title)
      setRawInput(data.item.raw_input)
      setCurrentJdHistoryId(id)
      setQuestionnaireToken(null)
      setQuestionnaireId(null)
      setAnswers(null)
      setRefinedJd('')
      setChanges([])
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedJd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCreateQuestionnaire() {
    if (!currentJdHistoryId || !generatedJd) return
    setGeneratingQ(true)
    try {
      const res = await fetch('/api/questionnaire/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdHistoryId: currentJdHistoryId, jobTitle, generatedJd }),
      })
      const data = await res.json()
      if (data.token) {
        setQuestionnaireToken(data.token)
        setQuestionnaireId(data.id)
      }
    } catch {
      alert('Có lỗi khi tạo bảng hỏi')
    } finally {
      setGeneratingQ(false)
    }
  }

  async function handleCheckAnswers() {
    if (!questionnaireId) return
    setChecking(true)
    setNotAnsweredYet(false)
    const res = await fetch(`/api/questionnaire/${questionnaireId}/answers`)
    const data = await res.json()
    if (data.answers) {
      setAnswers(data.answers)
    } else {
      setNotAnsweredYet(true)
    }
    setChecking(false)
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
    setGeneratedJd(refinedJd)
    setRefinedJd('')
    setChanges([])
    fetchHistory()
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-none">Jane AI</h1>
              <p className="text-xs text-gray-500">JD Generator</p>
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

      <div className="max-w-6xl mx-auto px-6 py-8 flex gap-6">
        {/* Sidebar history */}
        {showHistory && (
          <aside className="w-64 shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-700 text-sm">JD đã tạo</h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-[calc(100vh-200px)] overflow-y-auto">
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
          </aside>
        )}

        {/* Main content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="font-semibold text-gray-800">Thông tin tuyển dụng</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Vị trí tuyển dụng <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="VD: Senior Frontend Developer, Marketing Manager..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Yêu cầu thô <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={'Paste yêu cầu từ khách hàng vào đây. VD:\n- 3 năm kinh nghiệm React\n- Tiếng Anh tốt\n- Lương 2000-3000 USD\n- Remote 100%\n- Startup fintech, team 50 người...'}
                rows={10}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !jobTitle.trim() || !rawInput.trim()}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang tạo JD...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Tạo JD ngay
                </>
              )}
            </button>
          </div>

          {/* Output panel */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">JD đã tạo</h2>
              {generatedJd && (
                <button
                  onClick={handleCopy}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1.5 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-600">Đã copy!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy JD
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {!generatedJd && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm">JD sẽ xuất hiện ở đây</p>
                  <p className="text-gray-300 text-xs mt-1">Điền thông tin bên trái và nhấn Tạo JD</p>
                </div>
              )}
              {loading && (
                <div className="h-full flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
                    <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Jane đang viết JD...</p>
                  <p className="text-gray-300 text-xs mt-1">Thường mất 10-15 giây</p>
                </div>
              )}
              {generatedJd && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">{generatedJd}</pre>
              )}
            </div>

            {/* Bảng hỏi section */}
            {generatedJd && !refinedJd && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {!questionnaireToken ? (
                  <button
                    onClick={handleCreateQuestionnaire}
                    disabled={generatingQ || !currentJdHistoryId}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    {generatingQ ? 'Đang tạo bảng hỏi...' : '+ Tạo bảng hỏi cho sếp'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
                      <span className="text-xs text-indigo-700 flex-1 truncate">
                        Link: /q/{questionnaireToken}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/q/${questionnaireToken}`)
                          setCopiedLink(true)
                          setTimeout(() => setCopiedLink(false), 2000)
                        }}
                        className={`text-xs font-medium whitespace-nowrap transition-colors ${copiedLink ? 'text-green-600' : 'text-indigo-600'}`}
                      >
                        {copiedLink ? '✓ Đã copy!' : 'Copy link'}
                      </button>
                    </div>
                    {!answers ? (
                      <>
                        <button
                          onClick={handleCheckAnswers}
                          disabled={checking}
                          className="w-full border border-indigo-200 text-indigo-600 rounded-xl py-2 text-sm hover:bg-indigo-50 transition-colors disabled:opacity-60"
                        >
                          {checking ? 'Đang kiểm tra...' : 'Kiểm tra sếp đã điền chưa'}
                        </button>
                        {notAnsweredYet && (
                          <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-1.5">
                            Sếp chưa điền, gửi link nhắc sếp nhé 😅
                          </p>
                        )}
                      </>
                    ) : (
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
                            Đang tinh chỉnh... (mất ~15s)
                          </>
                        ) : '✦ Tinh chỉnh JD từ câu trả lời'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Refined JD review */}
            {refinedJd && (
              <div ref={refinedJdRef} className="mt-4 pt-4 border-t border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">JD đề xuất sau tinh chỉnh</p>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Chờ confirm</span>
                </div>
                {changes.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {changes.map((c, i) => (
                      <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
                        <span className="text-green-500 mt-0.5">↑</span>{c}
                      </li>
                    ))}
                  </ul>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-4 max-h-60 overflow-y-auto">
                  {refinedJd}
                </pre>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setRefinedJd(''); setChanges([]) }}
                    className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm"
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
        </div>
      </div>
    </div>
  )
}
