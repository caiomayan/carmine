CREATE TYPE "public"."game_server_region" AS ENUM('sao-paulo');--> statement-breakpoint
ALTER TABLE "game_servers" ADD COLUMN "region" "game_server_region" DEFAULT 'sao-paulo' NOT NULL;