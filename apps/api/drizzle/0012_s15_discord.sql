CREATE TABLE "discord_links" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"username" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"synced_at" timestamp with time zone,
	"retry_at" timestamp with time zone,
	CONSTRAINT "discord_links_discordId_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "discord_status_messages" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_links" ADD CONSTRAINT "discord_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;