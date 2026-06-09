'use client'

import { useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { parseChatMarkdown, type ChatInline } from '@/lib/recruiting-rag/chat-markdown'

type RecruitingMessageMetadata = {
  conversationId?: string
  usedChunkIds?: string[]
  sources?: Array<{
    chunkId: string
    topic: string
    sourceLabel: string
    score: number
  }>
}

type RecruitingUIMessage = UIMessage<RecruitingMessageMetadata>

function textFromMessage(message: RecruitingUIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

function chatErrorLabel(error: Error | undefined) {
  const message = error?.message ?? ''
  if (message.includes('OPENAI_API_KEY')) {
    return 'Jane chưa trả lời được vì thiếu OPENAI_API_KEY trên server.'
  }
  if (message.includes('ANTHROPIC_API_KEY') || message.includes('503')) {
    return 'Jane chưa trả lời được vì thiếu ANTHROPIC_API_KEY trên server.'
  }
  if (message.includes('401')) {
    return 'Bạn cần đăng nhập lại trước khi chat với Jane.'
  }
  if (message.includes('429')) {
    return 'Bạn đã đạt giới hạn chat hôm nay.'
  }
  return 'Jane chưa trả lời được. Kiểm tra API key hoặc server logs rồi thử lại nhé.'
}

function InlineText({ parts }: { parts: ChatInline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.bold ? (
          <strong key={index} className="font-semibold text-gray-900">
            {part.text}
          </strong>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  )
}

function AssistantMarkdown({ text }: { text: string }) {
  const blocks = parseChatMarkdown(text)

  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const className =
            block.level === 2
              ? 'mt-3 text-[15px] font-semibold text-gray-900 first:mt-0'
              : 'mt-2 text-sm font-semibold text-gray-900 first:mt-0'
          return (
            <h3 key={index} className={className}>
              <InlineText parts={block.children} />
            </h3>
          )
        }

        if (block.type === 'list') {
          return (
            <ul key={index} className="space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="list-disc pl-1">
                  <InlineText parts={item} />
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={index}>
            <InlineText parts={block.children} />
          </p>
        )
      })}
    </div>
  )
}

export default function RecruitingChatPanel() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [leadEmail, setLeadEmail] = useState('')
  const [leadName, setLeadName] = useState('')
  const [leadCompany, setLeadCompany] = useState('')
  const [leadStatus, setLeadStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const transport = useMemo(
    () =>
      new DefaultChatTransport<RecruitingUIMessage>({
        api: '/api/recruiting-chat',
      }),
    []
  )

  const { messages, sendMessage, status, error } = useChat<RecruitingUIMessage>({
    transport,
    onFinish: ({ message }) => {
      if (message.metadata?.conversationId) {
        setConversationId(message.metadata.conversationId)
      }
    },
  })

  const isStreaming = status === 'submitted' || status === 'streaming'
  const unread = messages.length > 0 && !open

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    try {
      await sendMessage({ text }, { body: { conversationId } })
    } catch (error) {
      console.error('Recruiting chat send failed:', error)
    }
  }

  async function handleLeadSubmit() {
    if (!leadEmail.trim() || leadStatus === 'sending') return
    setLeadStatus('sending')
    try {
      const res = await fetch('/api/recruiting-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: leadEmail,
          name: leadName,
          company: leadCompany,
          hiringNeed: input,
          conversationId,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setLeadStatus('sent')
    } catch {
      setLeadStatus('error')
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          aria-label="Mở AI chat với Jane"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-base font-bold">
            J
            <span
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-indigo-600 bg-emerald-400"
              aria-hidden="true"
            />
          </span>
          <span className="sr-only">Jane đang online</span>
          <span>Chat với Jane</span>
          {unread && <span className="h-2 w-2 rounded-full bg-amber-300" />}
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(680px,calc(100vh-40px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-[#1B2B6E] px-4 py-4 text-white">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Chat với Jane AI</p>
              <h2 className="text-base font-semibold leading-tight">Có thắc mắc gì chưa giải quyết được?</h2>
              <p className="mt-1 text-xs text-white/70">
                Hỏi thẳng mình nè.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-2xl leading-none text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Đóng chat"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50 p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="mr-8 rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">Hello!</p>
                  <p className="mt-1 text-gray-600">
                    Có gì đang kẹt trong tuyển dụng thì hỏi Jane nha.
                  </p>
                </div>
                <p className="px-1 text-xs text-gray-500">Chọn câu hỏi mẫu hoặc nhập câu hỏi của bạn.</p>
                {[
                  'Tôi nên dùng LinkedIn hay Facebook cho senior role?',
                  'JD này có quá nhiều must-have không?',
                  'Offer ngoài lương nên package thế nào?',
                ].map((starter) => (
                  <button
                    key={starter}
                    onClick={() => setInput(starter)}
                    className="block w-full text-left text-xs text-gray-600 bg-white border border-gray-100 rounded-lg px-3 py-2 hover:border-indigo-200 hover:text-indigo-700"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white ml-8 whitespace-pre-wrap'
                      : 'bg-white border border-gray-100 text-gray-700 mr-8'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <AssistantMarkdown text={textFromMessage(message)} />
                  ) : (
                    textFromMessage(message)
                  )}
                </div>
              ))
            )}
            {isStreaming && <p className="text-xs text-gray-400">Jane đang trả lời...</p>}
          </div>

          <div className="border-t border-gray-100 bg-white p-3 space-y-3">
            {error && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                {chatErrorLabel(error)}
              </p>
            )}

            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSend()
                  }
                }}
                rows={2}
                placeholder="VD: Tuyển Senior Backend thì sourcing channel nào hợp?"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="w-16 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Gửi
              </button>
            </div>

            <details className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-gray-600">
                Để Jane follow up khi bạn cần thêm tư vấn
              </summary>
              <div className="mt-2 space-y-2">
                <input
                  type="email"
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={leadName}
                    onChange={(event) => setLeadName(event.target.value)}
                    placeholder="Tên"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={leadCompany}
                    onChange={(event) => setLeadCompany(event.target.value)}
                    placeholder="Công ty"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLeadSubmit}
                    disabled={!leadEmail.trim() || leadStatus === 'sending'}
                    className="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {leadStatus === 'sending' ? 'Đang lưu...' : 'Gửi thông tin'}
                  </button>
                  {leadStatus === 'sent' && <span className="text-xs text-green-600">Đã lưu.</span>}
                  {leadStatus === 'error' && <span className="text-xs text-red-500">Thử lại nhé.</span>}
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </>
  )
}
