CREATE TABLE "account_stats_weekly" (
	"account_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"week_start" date NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"headshots" integer DEFAULT 0 NOT NULL,
	"damage" bigint DEFAULT 0 NOT NULL,
	"rounds_played" integer DEFAULT 0 NOT NULL,
	"rounds_won" integer DEFAULT 0 NOT NULL,
	"seconds_played" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_stats_weekly_account_id_mode_week_start_pk" PRIMARY KEY("account_id","mode","week_start")
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_kills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"killer_account_id" uuid NOT NULL,
	"victim_account_id" uuid NOT NULL,
	"weapon" text NOT NULL,
	"killed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_stats_weekly" ADD CONSTRAINT "account_stats_weekly_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_kills" ADD CONSTRAINT "team_kills_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_kills" ADD CONSTRAINT "team_kills_killer_account_id_accounts_id_fk" FOREIGN KEY ("killer_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_kills" ADD CONSTRAINT "team_kills_victim_account_id_accounts_id_fk" FOREIGN KEY ("victim_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_stats_weekly_ranking_idx" ON "account_stats_weekly" USING btree ("mode","week_start");--> statement-breakpoint
CREATE INDEX "game_events_received_idx" ON "game_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "team_kills_killer_idx" ON "team_kills" USING btree ("killer_account_id","killed_at");