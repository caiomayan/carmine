CREATE TYPE "public"."avatar_reason" AS ENUM('sexual', 'violence', 'hate', 'minor', 'personal_data', 'other');--> statement-breakpoint
CREATE TYPE "public"."avatar_source" AS ENUM('steam', 'custom');--> statement-breakpoint
CREATE TYPE "public"."avatar_status" AS ENUM('active', 'suspended', 'removed', 'replaced', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."media_bucket" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'avatar_keep';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'avatar_remove';--> statement-breakpoint
CREATE TABLE "account_avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "avatar_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_down_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"decision" text,
	"decided_at" timestamp with time zone,
	"decided_by_steam_id" bigint,
	"decision_reason" "avatar_reason",
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "avatar_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"avatar_id" uuid NOT NULL,
	"reporter_account_id" uuid,
	"reason" "avatar_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" "media_bucket" NOT NULL,
	"key" text NOT NULL,
	"purge" boolean DEFAULT false NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "steam_avatar_url" text;--> statement-breakpoint
-- Todo avatar até aqui é o da Steam: vira também o "avatar da Steam" guardado para a volta.
UPDATE "accounts" SET "steam_avatar_url" = "avatar_url" WHERE "avatar_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "avatar_source" "avatar_source" DEFAULT 'steam' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "avatar_upload_blocked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_avatars" ADD CONSTRAINT "account_avatars_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_reports" ADD CONSTRAINT "avatar_reports_avatar_id_account_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."account_avatars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_reports" ADD CONSTRAINT "avatar_reports_reporter_account_id_accounts_id_fk" FOREIGN KEY ("reporter_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_avatars_current_idx" ON "account_avatars" USING btree ("account_id") WHERE "account_avatars"."status" in ('active', 'suspended');--> statement-breakpoint
CREATE INDEX "account_avatars_account_idx" ON "account_avatars" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "account_avatars_removed_idx" ON "account_avatars" USING btree ("account_id","decided_at") WHERE "account_avatars"."status" = 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "avatar_reports_once_idx" ON "avatar_reports" USING btree ("avatar_id","reporter_account_id");--> statement-breakpoint
CREATE INDEX "avatar_reports_avatar_idx" ON "avatar_reports" USING btree ("avatar_id","created_at");--> statement-breakpoint
CREATE INDEX "avatar_reports_reporter_idx" ON "avatar_reports" USING btree ("reporter_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_deletions_object_idx" ON "media_deletions" USING btree ("bucket","key");--> statement-breakpoint
CREATE INDEX "media_deletions_due_idx" ON "media_deletions" USING btree ("run_at");