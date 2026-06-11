import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAssistantPersistencePayload,
  buildConversationInsertPayload,
  buildUserPersistencePayload,
  LeadValidationError,
  normalizeLeadPayload,
} from '@/lib/recruiting-rag/persistence'
import { checkRateLimitSafely, getRecruitingChatModelConfig } from '@/lib/recruiting-rag/runtime'

describe('recruiting chat persistence payloads', () => {
  it('builds conversation insert payloads with Clerk email when available', () => {
    assert.deepEqual(
      buildConversationInsertPayload({
        id: 'conversation-1',
        userId: 'user-1',
        userEmail: ' employer@example.com ',
      }),
      {
        id: 'conversation-1',
        user_id: 'user-1',
        user_email: 'employer@example.com',
      }
    )
  })

  it('builds user message persistence payloads from plain text', () => {
    assert.deepEqual(
      buildUserPersistencePayload({
        conversationId: 'conversation-1',
        content: 'Tôi nên post job ở kênh nào?',
      }),
      {
        conversation_id: 'conversation-1',
        role: 'user',
        content: 'Tôi nên post job ở kênh nào?',
        used_chunk_ids: [],
        sources: [],
      }
    )
  })

  it('builds assistant payloads with used chunk IDs and source metadata', () => {
    assert.deepEqual(
      buildAssistantPersistencePayload({
        conversationId: 'conversation-1',
        content: 'Bắt đầu từ candidate persona.',
        retrievedSources: [
          {
            chunkId: 'chunk-1',
            topic: 'candidate_persona',
            sourceLabel: 'JaneAI recruiting training corpus',
            score: 0.88,
          },
        ],
      }),
      {
        conversation_id: 'conversation-1',
        role: 'assistant',
        content: 'Bắt đầu từ candidate persona.',
        used_chunk_ids: ['chunk-1'],
        sources: [
          {
            chunkId: 'chunk-1',
            topic: 'candidate_persona',
            sourceLabel: 'JaneAI recruiting training corpus',
            score: 0.88,
          },
        ],
      }
    )
  })
})

describe('recruiting lead normalization', () => {
  it('trims valid lead details and normalizes empty optionals', () => {
    assert.deepEqual(
      normalizeLeadPayload({
        email: ' employer@example.com ',
        name: ' Jane ',
        company: '',
        hiringNeed: ' Tuyển Data Scientist ',
        conversationId: 'conversation-1',
      }),
      {
        email: 'employer@example.com',
        name: 'Jane',
        company: null,
        hiringNeed: 'Tuyển Data Scientist',
        conversationId: 'conversation-1',
      }
    )
  })

  it('rejects invalid email addresses', () => {
    assert.throws(
      () =>
        normalizeLeadPayload({
          email: 'not-an-email',
        }),
      /valid email/
    )
  })

  it('throws LeadValidationError so the API can tell client mistakes from server failures', () => {
    const isValidationError = (error: unknown) => error instanceof LeadValidationError
    assert.throws(() => normalizeLeadPayload({ email: 'not-an-email' }), isValidationError)
    assert.throws(
      () => normalizeLeadPayload({ email: 'a@b.co', name: 'x'.repeat(121) }),
      isValidationError
    )
    assert.throws(() => normalizeLeadPayload({ email: 'a@b.co', company: 42 }), isValidationError)
  })
})

describe('recruiting chat runtime guards', () => {
  it('allows chat when rate-limit persistence is unavailable', async () => {
    const originalConsoleError = console.error
    console.error = () => {}
    try {
      const result = await checkRateLimitSafely('user-1', 'recruiting-chat', async () => {
        throw new Error('Supabase unavailable')
      })

      assert.deepEqual(result, { allowed: true, remaining: 0 })
    } finally {
      console.error = originalConsoleError
    }
  })

  it('defaults the recruiting chat to Anthropic for deployment safety', () => {
    assert.deepEqual(getRecruitingChatModelConfig({} as NodeJS.ProcessEnv), {
      provider: 'anthropic',
      modelId: 'claude-opus-4-7',
      requiredEnvName: 'ANTHROPIC_API_KEY',
      hasApiKey: false,
    })
  })

  it('can switch recruiting chat to OpenAI with one provider env var', () => {
    assert.deepEqual(
      getRecruitingChatModelConfig({
        RECRUITING_CHAT_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
      } as unknown as NodeJS.ProcessEnv),
      {
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        requiredEnvName: 'OPENAI_API_KEY',
        hasApiKey: true,
      }
    )
  })

  it('auto-selects OpenAI in local dev when only an OpenAI key is configured', () => {
    assert.deepEqual(
      getRecruitingChatModelConfig({
        NODE_ENV: 'development',
        OPENAI_API_KEY: 'sk-test',
      } as NodeJS.ProcessEnv),
      {
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        requiredEnvName: 'OPENAI_API_KEY',
        hasApiKey: true,
      }
    )
  })

  it('supports provider-specific recruiting chat model overrides', () => {
    assert.deepEqual(
      getRecruitingChatModelConfig({
        RECRUITING_CHAT_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
        RECRUITING_CHAT_OPENAI_MODEL: 'gpt-5.5',
      } as unknown as NodeJS.ProcessEnv),
      {
        provider: 'openai',
        modelId: 'gpt-5.5',
        requiredEnvName: 'OPENAI_API_KEY',
        hasApiKey: true,
      }
    )
  })
})
