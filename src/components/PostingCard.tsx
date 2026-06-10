'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ChannelPostBlock from './ChannelPostBlock'
import type { ConnectedAccount, PostCampaign, ChannelRecommendation } from '@/lib/supabase'

type Channel = 'linkedin' | 'facebook' | 'threads' | 'topcv'
const CHANNELS: Channel[] = ['linkedin', 'facebook', 'threads', 'topcv']

type Props = {
  jdHistoryId: string
}

type CampaignMap = Partial<Record<Channel, PostCampaign>>
type AccountMap = Partial<Record<Channel, ConnectedAccount>>

export default function PostingCard({ jdHistoryId }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<ChannelRecommendation[]>([])
  const [jobType, setJobType] = useState<string>('')
  const [seniority, setSeniority] = useState<string>('')
  const [campaigns, setCampaigns] = useState<CampaignMap>({})
  const [accounts, setAccounts] = useState<AccountMap>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAccounts = useCallback(async () => {
    const results = await Promise.allSettled(
      (['linkedin', 'facebook'] as Channel[]).map(async (p) => {
        const res = await fetch(`/api/auth/${p}/status`)
        const data = await res.json() as { connected: boolean; account: ConnectedAccount }
        return { platform: p, account: data.connected ? data.account : null }
      })
    )
    const map: AccountMap = {}
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        map[r.value.platform] = r.value.account ?? undefined
      }
    })
    setAccounts(map)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch existing campaigns (nếu có)
      const campRes = await fetch(`/api/post-job/campaigns?jd_id=${jdHistoryId}`)
      const campData = await campRes.json() as { campaigns: PostCampaign[] }
      if (campData.campaigns?.length > 0) {
        const map: CampaignMap = {}
        campData.campaigns.forEach(c => { map[c.channel as Channel] = c })
        setCampaigns(map)
      }

      // Fetch channel recommendations
      const recRes = await fetch('/api/post-job/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_history_id: jdHistoryId, mode: 'recommend' }),
      })
      const recData = await recRes.json() as {
        recommendations: {
          job_type: string
          seniority: string
          channel_recommendations: ChannelRecommendation[]
        }
        error?: string
      }
      if (recData.error) throw new Error(recData.error)
      setRecommendations(recData.recommendations.channel_recommendations)
      setJobType(recData.recommendations.job_type)
      setSeniority(recData.recommendations.seniority)
    } catch (err) {
      console.error('PostingCard fetch error:', err)
      setError('Không tải được gợi ý kênh, thử lại nhé!')
    } finally {
      setLoading(false)
    }
  }, [jdHistoryId])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData()
      fetchAccounts()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchData, fetchAccounts])

  function handleContentChange(campaignId: string, content: string) {
    setCampaigns(prev => {
      const updated = { ...prev }
      for (const ch of CHANNELS) {
        if (updated[ch]?.id === campaignId) {
          updated[ch] = { ...updated[ch]!, content }
        }
      }
      return updated
    })

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      fetch('/api/post-job/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, content }),
      }).catch(console.error)
    }, 600)
  }

  function handleCampaignGenerated(channel: Channel, campaign: PostCampaign) {
    setCampaigns(prev => ({ ...prev, [channel]: campaign }))
  }

  async function handlePublish(campaignId: string) {
    const res = await fetch('/api/post-job/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Lỗi không rõ')

    setCampaigns(prev => {
      const updated = { ...prev }
      for (const ch of CHANNELS) {
        if (updated[ch]?.id === campaignId) {
          updated[ch] = { ...updated[ch]!, status: 'posted', posted_at: new Date().toISOString() }
        }
      }
      return updated
    })
    fetchAccounts()
  }

  // Sort channels by stars
  const sortedChannels = [...CHANNELS].sort((a, b) => {
    const starsA = recommendations.find(r => r.channel === a)?.stars ?? 0
    const starsB = recommendations.find(r => r.channel === b)?.stars ?? 0
    return starsB - starsA
  })

  return (
    <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">✦</span>
          </div>
          <h2 className="font-bold text-gray-800 text-base">Đăng tuyển ngay</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">Jane gợi ý kênh + generate content phù hợp cho từng nơi</p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-10">
            <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Jane đang phân tích JD... (~5s)</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={fetchData} className="mt-2 text-xs text-red-500 underline">Thử lại</button>
          </div>
        )}

        {!loading && !error && recommendations.length > 0 && (
          <>
            {/* Job classify summary */}
            <div className="bg-indigo-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-indigo-700 mb-1">Jane phân tích</p>
              <p className="text-xs text-indigo-600">
                {jobType && seniority ? `${seniority.charAt(0).toUpperCase() + seniority.slice(1)} · ${jobType.charAt(0).toUpperCase() + jobType.slice(1)}` : ''}
              </p>
            </div>

            {/* Channel blocks — sorted by stars, top channel open */}
            {sortedChannels.map((channel, idx) => {
              const rec = recommendations.find(r => r.channel === channel)
              return (
                <ChannelPostBlock
                  key={channel}
                  channel={channel}
                  jdHistoryId={jdHistoryId}
                  campaign={campaigns[channel] ?? null}
                  stars={rec?.stars ?? 1}
                  reason={rec?.reason ?? ''}
                  account={accounts[channel] ?? null}
                  defaultOpen={idx === 0}
                  onPublish={handlePublish}
                  onContentChange={handleContentChange}
                  onCampaignGenerated={(campaign) => handleCampaignGenerated(channel, campaign)}
                  onAccountConnected={fetchAccounts}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
