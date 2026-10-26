CREATE TYPE "public"."game_team" AS ENUM('ct', 't');--> statement-breakpoint
CREATE TABLE "account_stats_daily" (
	"account_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"day" date NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"headshots" integer DEFAULT 0 NOT NULL,
	"damage" bigint DEFAULT 0 NOT NULL,
	"rounds_played" integer DEFAULT 0 NOT NULL,
	"rounds_won" integer DEFAULT 0 NOT NULL,
	"seconds_played" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_stats_daily_account_id_mode_day_pk" PRIMARY KEY("account_id","mode","day")
);
--> statement-breakpoint
CREATE TABLE "account_weapon_stats" (
	"account_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"weapon" text NOT NULL,
	"side" "game_team" NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"headshots" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_weapon_stats_account_id_mode_weapon_side_pk" PRIMARY KEY("account_id","mode","weapon","side")
);
--> statement-breakpoint
CREATE TABLE "play_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"seconds" integer,
	"map" text,
	"maps" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_hours" (
	"server_id" uuid NOT NULL,
	"hour_start" timestamp with time zone NOT NULL,
	"map" text NOT NULL,
	"rounds_played" integer DEFAULT 0 NOT NULL,
	"ct_wins" integer DEFAULT 0 NOT NULL,
	"t_wins" integer DEFAULT 0 NOT NULL,
	"first_round_at" timestamp with time zone NOT NULL,
	"last_round_at" timestamp with time zone NOT NULL,
	"last_round_number" integer,
	"score_ct" integer,
	"score_t" integer,
	CONSTRAINT "server_hours_server_id_hour_start_map_pk" PRIMARY KEY("server_id","hour_start","map")
);
--> statement-breakpoint
ALTER TABLE "account_stats_daily" ADD CONSTRAINT "account_stats_daily_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_weapon_stats" ADD CONSTRAINT "account_weapon_stats_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_hours" ADD CONSTRAINT "server_hours_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_stats_daily_day_idx" ON "account_stats_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "play_sessions_account_idx" ON "play_sessions" USING btree ("account_id","started_at");--> statement-breakpoint
CREATE INDEX "play_sessions_server_idx" ON "play_sessions" USING btree ("server_id","started_at");--> statement-breakpoint
CREATE INDEX "play_sessions_started_idx" ON "play_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "server_hours_hour_idx" ON "server_hours" USING btree ("hour_start");