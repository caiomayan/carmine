CREATE TYPE "public"."payment_method" AS ENUM('pix', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'in_review', 'approved', 'rejected', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'charged_back');--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'payment_refund';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'purchase_unblock';--> statement-breakpoint
ALTER TYPE "public"."staff_audit_action" ADD VALUE 'vip_compensation';--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"request_id" text,
	"topic" text,
	"resource_id" text,
	"signature_valid" boolean NOT NULL,
	"payment_id" uuid,
	"outcome" text NOT NULL,
	"detail" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"package" text NOT NULL,
	"days" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"pix_copy_paste" text,
	"pix_qr_base64" text,
	"redirect_url" text,
	"expires_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"refunded_days" integer DEFAULT 0 NOT NULL,
	"refunded_at" timestamp with time zone,
	"charged_back_at" timestamp with time zone,
	"adult_declared_at" timestamp with time zone NOT NULL,
	"declaration_version" text NOT NULL,
	"payer_document_encrypted" text,
	"payer_document_last3" text,
	"payer_name" text,
	"failure_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "vip_held_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid NOT NULL,
	"item" jsonb NOT NULL,
	"item_created_at" timestamp with time zone,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"held_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "purchase_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "purchase_block_reason" text;--> statement-breakpoint
ALTER TABLE "vip_periods" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_held_items" ADD CONSTRAINT "vip_held_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_events_received_idx" ON "payment_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_idx" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_account_idempotency_idx" ON "payments" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "payments" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vip_held_items_item_idx" ON "vip_held_items" USING btree ("account_id","item_id");--> statement-breakpoint
CREATE INDEX "vip_held_items_held_idx" ON "vip_held_items" USING btree ("held_at");--> statement-breakpoint
ALTER TABLE "vip_periods" ADD CONSTRAINT "vip_periods_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_periods" ADD CONSTRAINT "vip_periods_paymentId_unique" UNIQUE("payment_id");