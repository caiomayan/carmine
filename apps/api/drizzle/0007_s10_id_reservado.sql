ALTER TYPE "public"."staff_audit_action" ADD VALUE 'account_reserved_id';--> statement-breakpoint
CREATE TABLE "account_public_id_history" (
	"public_id" bigint PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "public_id_reserved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_public_id_history" ADD CONSTRAINT "account_public_id_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;