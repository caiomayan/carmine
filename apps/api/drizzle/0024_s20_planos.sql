CREATE TYPE "public"."plan" AS ENUM('capo', 'padrinho');--> statement-breakpoint
CREATE TABLE "plan_revocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone NOT NULL,
	"revoked_by_steam_id" bigint NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vip_periods" ADD COLUMN "plan" "plan" DEFAULT 'capo' NOT NULL;--> statement-breakpoint
ALTER TABLE "vip_periods" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_revocations" ADD CONSTRAINT "plan_revocations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_revocations_account_idx" ON "plan_revocations" USING btree ("account_id","revoked_at");