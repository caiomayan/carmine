ALTER TABLE "accounts" ADD COLUMN "custom_display_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "display_name_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "profile_private" boolean DEFAULT false NOT NULL;