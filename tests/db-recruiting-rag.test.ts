import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  getOrCreateRecruitingConversation,
  saveRecruitingChatMessage,
  saveRecruitingLead,
} from '@/lib/recruiting-rag/db'
import { recruitingChatConversations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanupConversation(id: string) {
  // cascades to recruiting_chat_messages and sets recruiting_leads.conversation_id to null
  await testDb.delete(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
}

test('getOrCreateRecruitingConversation creates when no id given, reuses when given', async () => {
  const id = await getOrCreateRecruitingConversation({ userId: 'rag_user_1', userEmail: 'rag@test.dev' })
  try {
    assert.ok(id)
    const reused = await getOrCreateRecruitingConversation({ conversationId: id, userId: 'rag_user_1' })
    assert.equal(reused, id)
  } finally {
    await cleanupConversation(id)
  }
})

test('getOrCreateRecruitingConversation backfills user_email on an old conversation', async () => {
  const id = await getOrCreateRecruitingConversation({ userId: 'rag_user_2' })
  try {
    const rows1 = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    assert.equal(rows1[0].user_email, null)

    await getOrCreateRecruitingConversation({ conversationId: id, userId: 'rag_user_2', userEmail: 'later@test.dev' })
    const rows2 = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    assert.equal(rows2[0].user_email, 'later@test.dev')
  } finally {
    await cleanupConversation(id)
  }
})

test('saveRecruitingChatMessage inserts the message and bumps updated_at atomically', async () => {
  const id = await getOrCreateRecruitingConversation({ userId: 'rag_user_3' })
  try {
    const before = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    await new Promise((r) => setTimeout(r, 10))
    await saveRecruitingChatMessage({
      conversation_id: id,
      role: 'user',
      content: 'hello',
      used_chunk_ids: [],
      sources: [],
    })
    const after = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    assert.ok(new Date(after[0].updated_at) > new Date(before[0].updated_at))
  } finally {
    await cleanupConversation(id)
  }
})

test('saveRecruitingLead inserts and returns the id', async () => {
  const convId = await getOrCreateRecruitingConversation({ userId: 'rag_user_4' })
  try {
    const leadId = await saveRecruitingLead({
      userId: 'rag_user_4',
      payload: {
        email: 'lead@test.dev',
        phone: '0912345678',
        name: 'Test Lead',
        company: null,
        hiringNeed: null,
        conversationId: convId,
      },
    })
    assert.ok(leadId)
  } finally {
    await cleanupConversation(convId)
  }
})
