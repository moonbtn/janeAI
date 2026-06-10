export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { auth, currentUser } from '@clerk/nextjs/server'
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from 'ai'
import { NextResponse } from 'next/server'

import {
  buildAssistantPersistencePayload,
  buildUserPersistencePayload,
} from '@/lib/recruiting-rag/persistence'
import { buildRecruitingSystemPrompt } from '@/lib/recruiting-rag/prompt'
import {
  buildRetrievalQuery,
  prepareRagForChat,
  retrieveRelevantChunks,
  type ChatTextMessage,
} from '@/lib/recruiting-rag/retrieval'
import { getOrCreateRecruitingConversation, saveRecruitingChatMessage } from '@/lib/recruiting-rag/db'
import { loadDefaultApprovedChunks } from '@/lib/recruiting-rag/evaluation'
import {
  checkRateLimitSafely,
  getRecruitingChatLanguageModel,
  getRecruitingChatModelConfig,
} from '@/lib/recruiting-rag/runtime'

type RecruitingMessageMetadata = {
  conversationId?: string
  usedChunkIds?: string[]
  sources?: ReturnType<typeof prepareRagForChat>['retrievedSources']
}

type RecruitingUIMessage = UIMessage<RecruitingMessageMetadata>

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function getEmailFromSessionClaims(sessionClaims: unknown): string | null {
  if (!sessionClaims || typeof sessionClaims !== 'object') return null

  const claims = sessionClaims as Record<string, unknown>
  const candidates = [
    claims.email,
    claims.email_address,
    claims.primary_email_address,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.includes('@')) {
      return candidate
    }
  }

  return null
}

async function getCurrentUserEmailSafely(): Promise<string | null> {
  try {
    const user = await currentUser()
    return user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null
  } catch (error) {
    console.error('Recruiting chat user email lookup failed:', error)
    return null
  }
}

async function getConversationIdSafely({
  conversationId,
  userEmail,
  userId,
}: {
  conversationId?: string | null
  userEmail?: string | null
  userId: string
}) {
  try {
    return await getOrCreateRecruitingConversation({ conversationId, userId, userEmail })
  } catch (error) {
    console.error('Recruiting chat persistence unavailable:', error)
    return conversationId ?? crypto.randomUUID()
  }
}

async function saveRecruitingChatMessageSafely(
  input: Parameters<typeof saveRecruitingChatMessage>[0]
) {
  try {
    await saveRecruitingChatMessage(input)
  } catch (error) {
    console.error('Recruiting chat message persistence failed:', error)
  }
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userEmail = getEmailFromSessionClaims(sessionClaims) ?? (await getCurrentUserEmailSafely())

  const { allowed } = await checkRateLimitSafely(userId, 'recruiting-chat')
  if (!allowed) {
    return NextResponse.json({ error: 'Bạn đã đạt giới hạn chat hôm nay.' }, { status: 429 })
  }

  let body: { messages?: RecruitingUIMessage[]; conversationId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Missing messages' }, { status: 400 })
  }

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  const latestUserText = latestUserMessage ? getMessageText(latestUserMessage) : ''
  if (!latestUserText) {
    return NextResponse.json({ error: 'Missing user message' }, { status: 400 })
  }

  const modelConfig = getRecruitingChatModelConfig()
  if (!modelConfig.hasApiKey) {
    console.error(`Recruiting chat unavailable: missing ${modelConfig.requiredEnvName}`)
    return NextResponse.json(
      { error: `Thiếu ${modelConfig.requiredEnvName} nên Jane chưa thể trả lời.` },
      { status: 503 }
    )
  }

  try {
    const conversationId = await getConversationIdSafely({
      conversationId: body.conversationId,
      userEmail,
      userId,
    })
    await saveRecruitingChatMessageSafely(
      buildUserPersistencePayload({
        conversationId,
        content: latestUserText,
      })
    )

    const retrievalQuery = buildRetrievalQuery(messages as ChatTextMessage[])
    const retrievedResults = retrieveRelevantChunks(retrievalQuery, loadDefaultApprovedChunks(), 4)
    const rag = prepareRagForChat(retrievedResults)

    const result = streamText({
      model: getRecruitingChatLanguageModel(modelConfig),
      system: buildRecruitingSystemPrompt({
        retrievedContext: rag.retrievedContext,
        hasStrongContext: rag.hasStrongContext,
      }),
      messages: await convertToModelMessages(messages),
      maxOutputTokens: 1200,
      abortSignal: request.signal,
      onError({ error }) {
        console.error('Recruiting chat stream error:', error)
      },
    })

    return result.toUIMessageStreamResponse<RecruitingUIMessage>({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        if (part.type === 'start' || part.type === 'finish') {
          return {
            conversationId,
            usedChunkIds: rag.usedChunkIds,
            sources: rag.retrievedSources,
          }
        }
        return undefined
      },
      onFinish: async ({ responseMessage }) => {
        const assistantText = getMessageText(responseMessage)
        if (!assistantText) return
        await saveRecruitingChatMessageSafely(
          buildAssistantPersistencePayload({
            conversationId,
            content: assistantText,
            retrievedSources: rag.retrievedSources,
          })
        )
      },
      onError: (error) => {
        console.error('Recruiting chat UI stream error:', error)
        return `Jane chưa trả lời được lúc này. Kiểm tra ${modelConfig.requiredEnvName} rồi thử lại nhé.`
      },
    })
  } catch (error) {
    console.error('Recruiting chat error:', error)
    return NextResponse.json({ error: 'Có lỗi khi chat với Jane, thử lại nhé.' }, { status: 500 })
  }
}
