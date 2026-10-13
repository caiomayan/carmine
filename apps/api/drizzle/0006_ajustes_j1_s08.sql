ALTER TYPE "public"."staff_audit_action" ADD VALUE 'account_anonymize';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "chat_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "witness" text;--> statement-breakpoint
ALTER TABLE "sanctions" ADD COLUMN "evidence_url" text;