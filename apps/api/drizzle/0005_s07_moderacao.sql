CREATE TYPE "public"."sanction_category" AS ENUM('offensive_chat', 'offensive_voice', 'griefing', 'exploit', 'discrimination', 'cheat', 'threat', 'doxxing', 'ban_evasion');--> statement-breakpoint
CREATE TYPE "public"."sanction_type" AS ENUM('ban', 'mute', 'gag', 'kick', 'warning');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'admin', 'moderator');--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'sanction_apply';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'sanction_revoke';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'role_grant';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'role_revoke';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'display_name_reset';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'server_update';--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "sanction_type" NOT NULL,
	"category" "sanction_category" NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"applied_by_steam_id" bigint NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_steam_id" bigint,
	"revoke_reason" text,
	"appeal_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctions_instant_without_end" CHECK ("sanctions"."type" in ('ban', 'mute', 'gag') or "sanctions"."ends_at" is null),
	CONSTRAINT "sanctions_ends_after_start" CHECK ("sanctions"."ends_at" is null or "sanctions"."ends_at" > "sanctions"."starts_at"),
	CONSTRAINT "sanctions_revocation_complete" CHECK (("sanctions"."revoked_at" is null) = ("sanctions"."revoked_by_steam_id" is null) and ("sanctions"."revoked_at" is null) = ("sanctions"."revoke_reason" is null)),
	CONSTRAINT "sanctions_reason_present" CHECK (length(trim("sanctions"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"role" "staff_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_audit_log" ALTER COLUMN "target_steam_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "display_name_blocked_steam_name" text;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "showcase_name" text;--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD COLUMN "target_server_id" uuid;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanctions_account_idx" ON "sanctions" USING btree ("account_id","starts_at");--> statement-breakpoint
CREATE INDEX "sanctions_recent_idx" ON "sanctions" USING btree ("starts_at");--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD CONSTRAINT "staff_audit_log_target_server_id_game_servers_id_fk" FOREIGN KEY ("target_server_id") REFERENCES "public"."game_servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_audit_log_actor_idx" ON "staff_audit_log" USING btree ("actor_steam_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_audit_log_created_idx" ON "staff_audit_log" USING btree ("created_at","id");--> statement-breakpoint
ALTER TABLE "game_servers" ADD CONSTRAINT "game_servers_code_unique" UNIQUE("code");