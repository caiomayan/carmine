CREATE TYPE "public"."chat_team" AS ENUM('ct', 't', 'spectator');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('cheat', 'voice', 'offensive_chat', 'griefing', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'archived', 'sanctioned');--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'report_archive';--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"team" "chat_team" NOT NULL,
	"team_chat" boolean NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_account_id" uuid,
	"target_account_id" uuid NOT NULL,
	"server_id" uuid,
	"map" text,
	"round" integer,
	"reason" "report_reason" NOT NULL,
	"chat_context" jsonb NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_steam_id" bigint,
	"resolution_reason" text,
	CONSTRAINT "reports_resolution_complete" CHECK (("reports"."status" = 'open') = ("reports"."resolved_at" is null) and ("reports"."status" = 'open') = ("reports"."resolved_by_steam_id" is null))
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_account_id_accounts_id_fk" FOREIGN KEY ("reporter_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_server_idx" ON "chat_messages" USING btree ("server_id","at");--> statement-breakpoint
CREATE INDEX "chat_messages_account_idx" ON "chat_messages" USING btree ("account_id","at");--> statement-breakpoint
CREATE INDEX "chat_messages_at_idx" ON "chat_messages" USING btree ("at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_account_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_account_id","status");