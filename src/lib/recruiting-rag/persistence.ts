import type { RetrievedSourceMetadata } from './retrieval'

export type ChatRole = 'user' | 'assistant'

export type RecruitingChatMessageInsert = {
  conversation_id: string
  role: ChatRole
  content: string
  used_chunk_ids: string[]
  sources: RetrievedSourceMetadata[]
}

export function buildConversationInsertPayload({
  id,
  userId,
  userEmail,
}: {
  id: string
  userId: string
  userEmail?: string | null
}) {
  return {
    id,
    user_id: userId,
    user_email: userEmail?.trim() || null,
  }
}

export function buildUserPersistencePayload({
  conversationId,
  content,
}: {
  conversationId: string
  content: string
}): RecruitingChatMessageInsert {
  return {
    conversation_id: conversationId,
    role: 'user',
    content: content.trim(),
    used_chunk_ids: [],
    sources: [],
  }
}

export function buildAssistantPersistencePayload({
  conversationId,
  content,
  retrievedSources,
}: {
  conversationId: string
  content: string
  retrievedSources: RetrievedSourceMetadata[]
}): RecruitingChatMessageInsert {
  return {
    conversation_id: conversationId,
    role: 'assistant',
    content: content.trim(),
    used_chunk_ids: retrievedSources.map((source) => source.chunkId),
    sources: retrievedSources,
  }
}

type LeadInput = {
  email?: unknown
  phone?: unknown
  name?: unknown
  company?: unknown
  hiringNeed?: unknown
  conversationId?: unknown
}

export type NormalizedLeadPayload = {
  email: string
  phone: string
  name: string | null
  company: string | null
  hiringNeed: string | null
  conversationId: string | null
}

export class LeadValidationError extends Error {}

function nullableTrimmed(value: unknown, maxLength: number, field: string): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new LeadValidationError(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLength) throw new LeadValidationError(`${field} is too long`)
  return trimmed
}

function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LeadValidationError('Please enter a phone number')
  }
  const cleaned = value.replace(/[\s().-]/g, '')
  if (!/^(0\d{9,10}|\+\d{10,12})$/.test(cleaned)) {
    throw new LeadValidationError('Please enter a valid phone number')
  }
  return cleaned
}

export function normalizeLeadPayload(payload: LeadInput): NormalizedLeadPayload {
  const email = nullableTrimmed(payload.email, 254, 'email')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new LeadValidationError('Please enter a valid email address')
  }

  return {
    email,
    phone: normalizePhone(payload.phone),
    name: nullableTrimmed(payload.name, 120, 'name'),
    company: nullableTrimmed(payload.company, 120, 'company'),
    hiringNeed: nullableTrimmed(payload.hiringNeed, 2000, 'hiringNeed'),
    conversationId: nullableTrimmed(payload.conversationId, 120, 'conversationId'),
  }
}
