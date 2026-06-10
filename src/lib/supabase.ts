import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null
let _adminClient: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export type JdHistory = {
  id: string
  job_title: string
  raw_input: string
  generated_jd: string
  created_at: string
  status: 'active' | 'hired'
}

export type Question = {
  id: string
  section: number
  sectionLabel: string
  text: string
  hint?: string
  type: 'yes_no' | 'multiple_choice' | 'open' | 'skill_matrix' | 'checkbox_multi'
  options?: string[]
  aiPrefilled?: boolean
}

export type Questionnaire = {
  id: string
  jd_history_id: string
  token: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  status: 'pending' | 'answered'
  language: 'vi' | 'en'
  expires_at: string
  created_at: string
  is_resend: boolean
}

export type QuestionnaireAnswer = {
  id: string
  questionnaire_id: string
  answers: Record<string, unknown>
  submitted_at: string
}

export function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

export type PostCampaign = {
  id: string
  jd_history_id: string
  channel: 'linkedin' | 'facebook' | 'threads' | 'topcv'
  content: string
  status: 'draft' | 'posted' | 'failed'
  platform_post_id: string | null
  posted_at: string | null
  created_at: string
}

export type ConnectedAccount = {
  id: string
  user_id: string
  platform: 'linkedin' | 'facebook' | 'threads'
  platform_user_id: string | null
  platform_user_name: string | null
  facebook_pages: Array<{ id: string; name: string; access_token: string }> | null
  selected_page_id: string | null
  created_at: string
}

export type ContentStyle = 'announcement' | 'story_telling' | 'benefit_focus' | 'seeding' | 'trending_funny' | 'opinion_hook' | 'relatable_scenario' | 'insider_drop'

export type ChannelRecommendation = {
  channel: 'linkedin' | 'facebook' | 'threads' | 'topcv'
  stars: number
  reason: string
}

export type ChannelRecommendations = {
  job_type: string
  seniority: string
  channel_recommendations: ChannelRecommendation[]
}

// Giữ nguyên GeneratedPosts cho backwards compat (vẫn dùng trong campaigns)
export type GeneratedPosts = {
  linkedin: string
  facebook: string
  threads: string
  topcv: string
  job_type: string
  channel_recommendations: ChannelRecommendation[]
}
