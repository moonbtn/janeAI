import { getSupabaseAdmin } from '@/lib/supabase'
import {
  buildConversationInsertPayload,
  type NormalizedLeadPayload,
  type RecruitingChatMessageInsert,
} from './persistence'

type SupabaseAny = ReturnType<typeof getSupabaseAdmin> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

function db(): SupabaseAny {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabaseAdmin() as any
}

export async function getOrCreateRecruitingConversation({
  conversationId,
  userId,
  userEmail,
}: {
  conversationId?: string | null
  userId: string
  userEmail?: string | null
}): Promise<string> {
  if (conversationId) {
    const { data, error } = await (db().from('recruiting_chat_conversations') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select('id, user_email')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (data?.id) {
      if (userEmail?.trim() && !data.user_email) {
        const { error: updateError } = await (db().from('recruiting_chat_conversations') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .update({ user_email: userEmail.trim() })
          .eq('id', data.id)
          .eq('user_id', userId)

        if (updateError) throw updateError
      }
      return String(data.id)
    }
  }

  const id = crypto.randomUUID()
  const { data, error } = await (db().from('recruiting_chat_conversations') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(buildConversationInsertPayload({ id, userId, userEmail }))
    .select('id')
    .maybeSingle()

  if (error) throw error
  return data?.id ? String(data.id) : id
}

export async function saveRecruitingChatMessage(input: RecruitingChatMessageInsert) {
  const { error } = await (db().from('recruiting_chat_messages') as any).insert(input) // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error) throw error

  const { error: updateError } = await (db().from('recruiting_chat_conversations') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversation_id)

  if (updateError) throw updateError
}

export async function saveRecruitingLead({
  userId,
  payload,
}: {
  userId: string
  payload: NormalizedLeadPayload
}) {
  const { data, error } = await (db().from('recruiting_leads') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({
      user_id: userId,
      conversation_id: payload.conversationId,
      email: payload.email,
      name: payload.name,
      company: payload.company,
      hiring_need: payload.hiringNeed,
      metadata: {
        source: 'recruiting_chatbot',
        capturedAt: new Date().toISOString(),
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}
