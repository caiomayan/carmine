CREATE TYPE "public"."game_mode" AS ENUM('retake', 'deathmatch');--> statement-breakpoint
CREATE SEQUENCE "public"."public_id_counter" INCREMENT BY 1 MINVALUE 0 MAXVALUE 9223372036854775807 START WITH 0 CACHE 1;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"steam_id" bigint NOT NULL,
	"public_id" bigint NOT NULL,
	"steam_name" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"avatar_fetched_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"first_connected_at" timestamp with time zone,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_steamId_unique" UNIQUE("steam_id"),
	CONSTRAINT "accounts_publicId_unique" UNIQUE("public_id"),
	CONSTRAINT "accounts_public_id_positive" CHECK ("accounts"."public_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "game_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"mode" "game_mode" NOT NULL,
	"address" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_servers_name_unique" UNIQUE("name"),
	CONSTRAINT "game_servers_keyHash_unique" UNIQUE("key_hash")
);
