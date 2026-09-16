import { pgTable, uuid, text, jsonb, timestamp, boolean, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Question } from './types'

export const jdHistory = pgTable('jd_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_title: text('job_title').notNull(),
  raw_input: text('raw_input').notNull(),
  generated_jd: text('generated_jd').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  user_id: text('user_id'),
  status: text('status').notNull().default('active'),
}, (table) => [
  check('jd_history_status_check', sql`${table.status} in ('active', 'hired')`),
])

export const questionnaires = pgTable('questionnaires', {
  id: uuid('id').primaryKey().defaultRandom(),
  jd_history_id: uuid('jd_history_id').references(() => jdHistory.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique().default(sql`encode(gen_random_bytes(16), 'hex')`),
  questions: jsonb('questions').$type<Question[]>().notNull().default(sql`'[]'::jsonb`),
  prefilled_answers: jsonb('prefilled_answers').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('pending'),
  expires_at: timestamp('expires_at', { withTimezone: true }).default(sql`(now() + interval '30 days')`),
  created_at: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  language: text('language').notNull().default('vi'),
  is_resend: boolean('is_resend').notNull().default(false),
}, (table) => [
  check('questionnaires_status_check', sql`${table.status} in ('pending', 'answered')`),
])

export const questionnaireAnswers = pgTable('questionnaire_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionnaire_id: uuid('questionnaire_id')
    .references(() => questionnaires.id, { onDelete: 'cascade' })
    .unique(),
  answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).default(sql`now()`),
})

export const postCampaigns = pgTable('post_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  jd_history_id: uuid('jd_history_id').references(() => jdHistory.id),
  channel: text('channel').notNull(),
  content: text('content').notNull(),
  status: text('status').notNull().default('draft'),
  platform_post_id: text('platform_post_id'),
  posted_at: timestamp('posted_at', { withTimezone: true, mode: 'string' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('post_campaigns_jd_history_id_channel_key').on(table.jd_history_id, table.channel),
  check('post_campaigns_status_check', sql`${table.status} in ('draft', 'posted', 'failed')`),
  check('post_campaigns_channel_check', sql`${table.channel} in ('linkedin', 'facebook', 'threads', 'topcv')`),
])

export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  platform: text('platform').notNull(),
  access_token: text('access_token').notNull(),
  refresh_token: text('refresh_token'),
  token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
  platform_user_id: text('platform_user_id'),
  platform_user_name: text('platform_user_name'),
  facebook_pages: jsonb('facebook_pages').$type<Array<{ id: string; name: string; access_token: string }>>(),
  selected_page_id: text('selected_page_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('connected_accounts_user_id_platform_key').on(table.user_id, table.platform),
  check('connected_accounts_platform_check', sql`${table.platform} in ('linkedin', 'facebook', 'threads')`),
])

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  email: text('email'),
  message: text('message').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiUsage = pgTable('api_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  called_at: timestamp('called_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recruitingChatConversations = pgTable('recruiting_chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  user_email: text('user_email'),
})

export const recruitingChatMessages = pgTable('recruiting_chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id')
    .notNull()
    .references(() => recruitingChatConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  used_chunk_ids: text('used_chunk_ids').array().notNull().default(sql`'{}'::text[]`),
  sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('recruiting_chat_messages_role_check', sql`${table.role} in ('user', 'assistant')`),
])

export const recruitingLeads = pgTable('recruiting_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  conversation_id: uuid('conversation_id').references(() => recruitingChatConversations.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  name: text('name'),
  company: text('company'),
  hiring_need: text('hiring_need'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  phone: text('phone'),
})

export type JdHistory = typeof jdHistory.$inferSelect
export type Questionnaire = typeof questionnaires.$inferSelect
export type QuestionnaireAnswer = typeof questionnaireAnswers.$inferSelect
export type PostCampaign = typeof postCampaigns.$inferSelect
export type ConnectedAccount = typeof connectedAccounts.$inferSelect
