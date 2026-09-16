import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { recruitingChatConversations, recruitingChatMessages, recruitingLeads } from '@/lib/db/schema'
import {
  buildConversationInsertPayload,
  type NormalizedLeadPayload,
  type RecruitingChatMessageInsert,
} from './persistence'

export async function getOrCreateRecruitingConversation({
  conversationId,
  userId,
  userEmail,
}: {
  conversationId?: string | null
  userId: string
  userEmail?: string | null
}): Promise<string> {
  const db = getDb()

  if (conversationId) {
    const rows = await db
      .select({ id: recruitingChatConversations.id, user_email: recruitingChatConversations.user_email })
      .from(recruitingChatConversations)
      .where(
        and(eq(recruitingChatConversations.id, conversationId), eq(recruitingChatConversations.user_id, userId)),
      )
      .limit(1)
    const existing = rows[0]

    if (existing) {
      if (userEmail?.trim() && !existing.user_email) {
        await db
          .update(recruitingChatConversations)
          .set({ user_email: userEmail.trim() })
          .where(and(eq(recruitingChatConversations.id, existing.id), eq(recruitingChatConversations.user_id, userId)))
      }
      return String(existing.id)
    }
  }

  const id = crypto.randomUUID()
  const rows = await db
    .insert(recruitingChatConversations)
    .values(buildConversationInsertPayload({ id, userId, userEmail }))
    .returning({ id: recruitingChatConversations.id })

  return rows[0]?.id ? String(rows[0].id) : id
}

export async function saveRecruitingChatMessage(input: RecruitingChatMessageInsert) {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.insert(recruitingChatMessages).values(input)
    await tx
      .update(recruitingChatConversations)
      .set({ updated_at: new Date() })
      .where(eq(recruitingChatConversations.id, input.conversation_id))
  })
}

export async function saveRecruitingLead({
  userId,
  payload,
}: {
  userId: string
  payload: NormalizedLeadPayload
}) {
  const rows = await getDb()
    .insert(recruitingLeads)
    .values({
      user_id: userId,
      conversation_id: payload.conversationId,
      email: payload.email,
      phone: payload.phone,
      name: payload.name,
      company: payload.company,
      hiring_need: payload.hiringNeed,
      metadata: {
        source: 'recruiting_chatbot',
        capturedAt: new Date().toISOString(),
      },
    })
    .returning({ id: recruitingLeads.id })

  return String(rows[0].id)
}
