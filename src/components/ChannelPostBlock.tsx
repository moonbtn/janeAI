'use client'

import { useState, useRef, useEffect } from 'react'
import type { ContentStyle, PostCampaign, ConnectedAccount } from '@/lib/supabase'

type Channel = 'linkedin' | 'facebook' | 'threads' | 'topcv'

const CHANNEL_META: Record<Channel, {
  icon: string
  label: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  linkedin:  { icon: '💼', label: 'LinkedIn',          color: '#6366f1', bgColor: '#eef2ff', borderColor: '#a5b4fc' },
  facebook:  { icon: '📘', label: 'Facebook Group',    color: '#1877f2', bgColor: '#eff6ff', borderColor: '#93c5fd' },
  threads:   { icon: '🧵', label: 'Threads',           color: '#111111', bgColor: '#f9fafb', borderColor: '#d1d5db' },
  topcv:     { icon: '📄', label: 'TopCV / Job Board', color: '#6b7280', bgColor: '#f9fafb', borderColor: '#e5e7eb' },
}

// Styles available per channel
const CHANNEL_STYLES: Record<Channel, ContentStyle[]> = {
  linkedin:  ['announcement', 'story_telling', 'benefit_focus'],
  facebook:  ['announcement', 'story_telling', 'benefit_focus', 'seeding', 'trending_funny'],
  threads:   ['benefit_focus', 'seeding', 'trending_funny'],
  topcv:     [], // content-only, no style picker
}

const STYLE_LABELS: Record<ContentStyle, string> = {
  announcement:   'Thông báo',
  story_telling:  'Story Telling',
  benefit_focus:  'Benefit Focus',
  seeding:        'Seeding',
  trending_funny: 'Trending / Funny',
}

// Recommended style per channel
const CHANNEL_RECOMMENDED_STYLE: Partial<Record<Channel, ContentStyle>> = {
  linkedin:  'announcement',
  facebook:  'seeding',
  threads:   'benefit_focus',
}

type Props = {
  channel: Channel
  jdHistoryId: string
  campaign: PostCampaign | null
  stars: number
  reason: string
  account: ConnectedAccount | null
  defaultOpen: boolean
  onPublish: (campaignId: string) => Promise<void>
  onContentChange: (campaignId: string, content: string) => void
  onCampaignGenerated: (campaign: PostCampaign) => void
  onAccountConnected: () => void
}

export default function ChannelPostBlock({
  channel,
  jdHistoryId,
  campaign,
  stars,
  reason,
  account,
  defaultOpen,
  onPublish,
  onContentChange,
  onCampaignGenerated,
  onAccountConnected,
}: Props) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const [contentExpanded, setContentExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<ContentStyle>(
    CHANNEL_RECOMMENDED_STYLE[channel] ?? CHANNEL_STYLES[channel][0]
  )
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function handleConnect() {
    const popup = window.open(`/api/auth/${channel}/connect`, '_blank', 'width=600,height=700')
    if (!popup) return
    setConnecting(true)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/${channel}/status`)
        const data = await res.json() as { connected: boolean }
        if (data.connected) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setConnecting(false)
          onAccountConnected()
          popup.close()
        }
      } catch { /* ignore */ }
    }, 2000)
  }

  const meta = CHANNEL_META[channel]
  const availableStyles = CHANNEL_STYLES[channel]
  const isContentOnly = availableStyles.length === 0 // topcv
  const canDirectPost = !isContentOnly && account !== null
  const posted = campaign?.status === 'posted'
  const failed = campaign?.status === 'failed'
  const clampedStars = Math.min(Math.max(stars, 0), 3)
  const starsStr = '★'.repeat(clampedStars) + '☆'.repeat(3 - clampedStars)
  const hasContent = !!campaign?.content

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/post-job/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_history_id: jdHistoryId,
          mode: 'generate',
          channel,
          style: isContentOnly ? 'announcement' : selectedStyle,
        }),
      })
      const data = await res.json() as { campaign?: PostCampaign; error?: string }
      if (data.error || !data.campaign) throw new Error(data.error ?? 'Lỗi generate')
      onCampaignGenerated(data.campaign)
      setContentExpanded(true)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setGenerating(false)
    }
  }

  async function handlePublish() {
    if (!campaign) return
    setPublishError(null)
    setPublishing(true)
    try {
      await onPublish(campaign.id)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Lỗi không rõ')
    } finally {
      setPublishing(false)
    }
  }

  function handleCopy() {
    if (!campaign) return
    navigator.clipboard.writeText(campaign.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // clipboard denied — user can see content in textarea to copy manually
    })
  }

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: posted ? '#86efac' : meta.borderColor }}
    >
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        style={{ backgroundColor: meta.bgColor }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{meta.icon}</span>
          <strong className="text-sm" style={{ color: meta.color }}>{meta.label}</strong>

          {posted && <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">✓ Đã đăng</span>}
          {failed && <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">Lỗi</span>}
          {hasContent && !posted && !failed && <span className="bg-indigo-100 text-indigo-600 text-xs px-2 py-0.5 rounded-full">✓ Đã có content</span>}
          {!posted && !failed && !isContentOnly && account && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✓ {account.platform_user_name ?? 'Đã kết nối'}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium" style={{ color: meta.color }}>{starsStr}</span>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Reason */}
          <p className="text-xs text-gray-400">{reason}</p>

          {/* Style picker — hidden for topcv */}
          {!isContentOnly && !posted && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Chọn style content:</p>
              <div className="flex flex-wrap gap-2">
                {availableStyles.map(style => {
                  const isSelected = selectedStyle === style
                  const isRecommended = CHANNEL_RECOMMENDED_STYLE[channel] === style
                  return (
                    <button
                      key={style}
                      onClick={() => setSelectedStyle(style)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        isSelected
                          ? 'text-white border-transparent'
                          : 'text-gray-600 border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      style={isSelected ? { backgroundColor: meta.color, borderColor: meta.color } : {}}
                    >
                      {STYLE_LABELS[style]}
                      {isRecommended && !isSelected && <span className="ml-1 text-indigo-400">✦</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Generate button */}
          {!posted && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: meta.color }}
            >
              {generating ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Jane đang viết...
                </>
              ) : hasContent ? `↺ Viết lại (${isContentOnly ? 'Full JD' : STYLE_LABELS[selectedStyle]})` : `✦ Generate content →`}
            </button>
          )}

          {generateError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{generateError}</p>
          )}

          {/* Content area */}
          {hasContent && campaign && (
            <div className="space-y-2">
              {!contentExpanded ? (
                <>
                  <p className="text-xs text-gray-600 line-clamp-3 bg-gray-50 rounded-lg p-3 leading-relaxed whitespace-pre-line">
                    {campaign.content}
                  </p>
                  <button onClick={() => setContentExpanded(true)} className="text-xs text-indigo-500 hover:text-indigo-700">
                    Xem đầy đủ &amp; chỉnh sửa ↓
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={campaign.content}
                    onChange={(e) => onContentChange(campaign.id, e.target.value)}
                    rows={8}
                    className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button onClick={() => setContentExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">
                    Thu gọn ↑
                  </button>
                </>
              )}

              {publishError && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{publishError}</p>
              )}

              {posted ? (
                <p className="text-xs text-green-600 text-center py-1">
                  ✓ Đã đăng lúc {campaign.posted_at
                    ? new Date(campaign.posted_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                    : ''}
                </p>
              ) : isContentOnly ? (
                <button
                  onClick={handleCopy}
                  className="w-full py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {copied ? '✓ Đã copy!' : 'Copy nội dung →'}
                </button>
              ) : canDirectPost ? (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  style={{ backgroundColor: meta.color }}
                >
                  {publishing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang đăng...
                    </>
                  ) : `Post lên ${meta.label} →`}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full py-2.5 text-sm font-semibold text-center rounded-lg border-2 transition-colors hover:bg-gray-50 disabled:opacity-60"
                  style={{ color: meta.color, borderColor: meta.color }}
                >
                  {connecting ? 'Đang chờ kết nối...' : `Kết nối ${meta.label} →`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
