CREATE TYPE "public"."loadout_slot_side" AS ENUM('ct', 't', 'any');--> statement-breakpoint
CREATE TYPE "public"."staff_audit_action" AS ENUM('vip_grant', 'vip_revoke');--> statement-breakpoint
CREATE TABLE "loadout_slots" (
	"preset_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"side" "loadout_slot_side" NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "loadout_slots_preset_id_slot_side_pk" PRIMARY KEY("preset_id","slot","side")
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"main" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_steam_id" bigint NOT NULL,
	"action" "staff_audit_action" NOT NULL,
	"target_account_id" uuid,
	"target_steam_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_audit_log_reason_present" CHECK (length(trim("staff_audit_log"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "econ_uid" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "inventory_items_econ_uid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "loadout_slots" ADD CONSTRAINT "loadout_slots_preset_id_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loadout_slots" ADD CONSTRAINT "loadout_slots_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD CONSTRAINT "staff_audit_log_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loadout_slots_item_idx" ON "loadout_slots" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presets_one_main_idx" ON "presets" USING btree ("account_id") WHERE "presets"."main";--> statement-breakpoint
CREATE UNIQUE INDEX "presets_one_active_idx" ON "presets" USING btree ("account_id") WHERE "presets"."active";--> statement-breakpoint
CREATE INDEX "presets_account_idx" ON "presets" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_audit_log_target_idx" ON "staff_audit_log" USING btree ("target_steam_id","created_at");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_econUid_unique" UNIQUE("econ_uid");