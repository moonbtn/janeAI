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

export type ContentStyle =
  | 'announcement'
  | 'story_telling'
  | 'benefit_focus'
  | 'seeding'
  | 'trending_funny'
  | 'opinion_hook'
  | 'relatable_scenario'
  | 'insider_drop'
  | 'english_announcement'

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

export type { JdHistory, Questionnaire, QuestionnaireAnswer, PostCampaign, ConnectedAccount } from './schema'
