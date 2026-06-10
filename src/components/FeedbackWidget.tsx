'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'

export default function FeedbackWidget() {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!message.trim() || sending) return
    setSending(true)
    try {
      const email = user?.emailAddresses?.[0]?.emailAddress ?? null
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email }),
      })
      setDone(true)
      setMessage('')
      setTimeout(() => {
        setDone(false)
        setOpen(false)
      }, 2000)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 bg-white border border-gray-200 text-gray-500 text-xs font-medium px-3.5 py-2 rounded-full shadow-md hover:shadow-lg hover:text-gray-700 transition-all"
      >
        Góp ý
      </button>

      {/* Popup */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-start p-5" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-xl w-80 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Góp ý cho Jane AI</p>
              <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
            </div>

            {done ? (
              <p className="text-sm text-green-600 py-3 text-center">✓ Cảm ơn bạn đã góp ý!</p>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Bạn gặp vấn đề gì, hoặc muốn Jane AI cải thiện điều gì?"
                  rows={4}
                  className="w-full text-sm text-gray-700 placeholder-gray-400 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || sending}
                  className="w-full bg-[#1B2B6E] text-white text-sm font-medium py-2.5 rounded-xl hover:bg-[#152258] transition-colors disabled:opacity-50"
                >
                  {sending ? 'Đang gửi...' : 'Gửi góp ý'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
