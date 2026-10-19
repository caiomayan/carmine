ALTER TYPE "public"."staff_audit_action" ADD VALUE 'ranking_entry_remove';--> statement-breakpoint
CREATE TABLE "ranking_removals" (
	"account_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"week_start" date NOT NULL,
	"removed_by_steam_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_removals_account_id_mode_week_start_pk" PRIMARY KEY("account_id","mode","week_start")
);
--> statement-breakpoint
ALTER TABLE "ranking_removals" ADD CONSTRAINT "ranking_removals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranking_removals_week_idx" ON "ranking_removals" USING btree ("mode","week_start");