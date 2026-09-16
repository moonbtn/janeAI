CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"platform_user_id" text,
	"platform_user_name" text,
	"facebook_pages" jsonb,
	"selected_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connected_accounts_user_id_platform_key" UNIQUE("user_id","platform"),
	CONSTRAINT "connected_accounts_platform_check" CHECK ("connected_accounts"."platform" in ('linkedin', 'facebook', 'threads'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jd_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_title" text NOT NULL,
	"raw_input" text NOT NULL,
	"generated_jd" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "jd_history_status_check" CHECK ("jd_history"."status" in ('active', 'hired'))
);
--> statement-breakpoint
CREATE TABLE "post_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jd_history_id" uuid,
	"channel" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"platform_post_id" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_campaigns_jd_history_id_channel_key" UNIQUE("jd_history_id","channel"),
	CONSTRAINT "post_campaigns_status_check" CHECK ("post_campaigns"."status" in ('draft', 'posted', 'failed')),
	CONSTRAINT "post_campaigns_channel_check" CHECK ("post_campaigns"."channel" in ('linkedin', 'facebook', 'threads', 'topcv'))
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionnaire_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "questionnaire_answers_questionnaire_id_unique" UNIQUE("questionnaire_id")
);
--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jd_history_id" uuid,
	"token" text DEFAULT encode(gen_random_bytes(16), 'hex') NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prefilled_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT (now() + interval '30 days'),
	"created_at" timestamp with time zone DEFAULT now(),
	"language" text DEFAULT 'vi' NOT NULL,
	"is_resend" boolean DEFAULT false NOT NULL,
	CONSTRAINT "questionnaires_token_unique" UNIQUE("token"),
	CONSTRAINT "questionnaires_status_check" CHECK ("questionnaires"."status" in ('pending', 'answered'))
);
--> statement-breakpoint
CREATE TABLE "recruiting_chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_email" text
);
--> statement-breakpoint
CREATE TABLE "recruiting_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"used_chunk_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_chat_messages_role_check" CHECK ("recruiting_chat_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "recruiting_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"hiring_need" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone" text
);
--> statement-breakpoint
ALTER TABLE "post_campaigns" ADD CONSTRAINT "post_campaigns_jd_history_id_jd_history_id_fk" FOREIGN KEY ("jd_history_id") REFERENCES "public"."jd_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_jd_history_id_jd_history_id_fk" FOREIGN KEY ("jd_history_id") REFERENCES "public"."jd_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_chat_messages" ADD CONSTRAINT "recruiting_chat_messages_conversation_id_recruiting_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."recruiting_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_leads" ADD CONSTRAINT "recruiting_leads_conversation_id_recruiting_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."recruiting_chat_conversations"("id") ON DELETE set null ON UPDATE no action;