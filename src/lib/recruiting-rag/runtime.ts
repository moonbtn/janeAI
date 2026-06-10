import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'

import { checkRateLimit } from '@/lib/rate-limit'

type RateLimitResult = {
  allowed: boolean
  remaining: number
}

type RateLimitChecker = (userId: string, endpoint: string) => Promise<RateLimitResult>
type RecruitingChatProvider = 'anthropic' | 'openai'

const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-7'
const OPENAI_DEFAULT_MODEL = 'gpt-5.4-mini'

function hasEnvValue(env: NodeJS.ProcessEnv, key: string) {
  return Boolean(env[key]?.trim())
}

export function getRecruitingChatModelConfig(env: NodeJS.ProcessEnv = process.env) {
  const requestedProvider = env.RECRUITING_CHAT_PROVIDER?.trim().toLowerCase()
  let provider: RecruitingChatProvider = requestedProvider === 'openai' ? 'openai' : 'anthropic'

  if (
    !requestedProvider &&
    env.NODE_ENV === 'development' &&
    hasEnvValue(env, 'OPENAI_API_KEY') &&
    !hasEnvValue(env, 'ANTHROPIC_API_KEY')
  ) {
    provider = 'openai'
  }

  if (provider === 'openai') {
    const requiredEnvName = 'OPENAI_API_KEY'
    return {
      provider,
      modelId: env.RECRUITING_CHAT_OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL,
      requiredEnvName,
      hasApiKey: hasEnvValue(env, requiredEnvName),
    }
  }

  const requiredEnvName = 'ANTHROPIC_API_KEY'
  return {
    provider,
    modelId: env.RECRUITING_CHAT_ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL,
    requiredEnvName,
    hasApiKey: hasEnvValue(env, requiredEnvName),
  }
}

export function getRecruitingChatLanguageModel(
  config: ReturnType<typeof getRecruitingChatModelConfig> = getRecruitingChatModelConfig()
) {
  if (config.provider === 'openai') {
    return openai(config.modelId)
  }
  return anthropic(config.modelId)
}

export async function checkRateLimitSafely(
  userId: string,
  endpoint: string,
  checker: RateLimitChecker = checkRateLimit
): Promise<RateLimitResult> {
  try {
    return await checker(userId, endpoint)
  } catch (error) {
    console.error(`Rate limit unavailable for ${endpoint}:`, error)
    return { allowed: true, remaining: 0 }
  }
}
