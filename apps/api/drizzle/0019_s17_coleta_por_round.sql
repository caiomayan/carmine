CREATE TYPE "public"."round_end_reason" AS ENUM('bomb_exploded', 'bomb_defused', 'elimination', 'time', 'other');--> statement-breakpoint
CREATE TYPE "public"."round_event_kind" AS ENUM('round_start', 'round_player', 'kill', 'damage', 'bomb', 'round_end', 'round_alive');--> statement-breakpoint
CREATE TYPE "public"."round_winner" AS ENUM('ct', 't', 'none');--> statement-breakpoint
CREATE TABLE "map_play_players" (
	"map_play_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"rounds" integer NOT NULL,
	"kills" integer NOT NULL,
	"headshots" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"flash_assists" integer NOT NULL,
	"damage" integer NOT NULL,
	"kast_rounds" integer NOT NULL,
	"survived_rounds" integer NOT NULL,
	"opening_kills" integer NOT NULL,
	"opening_deaths" integer NOT NULL,
	"clutches" integer NOT NULL,
	"clutches_won" integer NOT NULL,
	CONSTRAINT "map_play_players_map_play_id_account_id_pk" PRIMARY KEY("map_play_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "map_plays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"map" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"rounds" integer NOT NULL,
	"score_ct" integer,
	"score_t" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_events" (
	"id" uuid NOT NULL,
	"seq" smallint DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"server_id" uuid NOT NULL,
	"map_play_id" uuid NOT NULL,
	"round_number" smallint NOT NULL,
	"kind" "round_event_kind" NOT NULL,
	"at_ms" bigint,
	"actor_account_id" uuid,
	"target_account_id" uuid,
	"assist_account_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "round_events_id_seq_occurred_at_pk" PRIMARY KEY("id","seq","occurred_at")
)
PARTITION BY RANGE ("occurred_at");
--> statement-breakpoint
CREATE TABLE "round_player_summaries" (
	"map_play_id" uuid NOT NULL,
	"round_number" smallint NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "game_team" NOT NULL,
	"equipment_value" integer,
	"kills" smallint NOT NULL,
	"headshots" smallint NOT NULL,
	"deaths" smallint NOT NULL,
	"assists" smallint NOT NULL,
	"flash_assists" smallint NOT NULL,
	"damage" integer NOT NULL,
	"survived" boolean NOT NULL,
	"traded" boolean NOT NULL,
	"opening_kill" boolean NOT NULL,
	"opening_death" boolean NOT NULL,
	"multi_kill" smallint,
	"clutch_against" smallint,
	"clutch_won" boolean,
	"kast" boolean NOT NULL,
	CONSTRAINT "round_player_summaries_map_play_id_round_number_account_id_pk" PRIMARY KEY("map_play_id","round_number","account_id"),
	CONSTRAINT "round_player_summaries_clutch_complete" CHECK (("round_player_summaries"."clutch_against" is null) = ("round_player_summaries"."clutch_won" is null))
);
--> statement-breakpoint
CREATE TABLE "round_summaries" (
	"map_play_id" uuid NOT NULL,
	"round_number" smallint NOT NULL,
	"winner" "round_winner" NOT NULL,
	"reason" "round_end_reason",
	"duration_ms" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"score_ct" integer,
	"score_t" integer,
	"map" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_summaries_map_play_id_round_number_pk" PRIMARY KEY("map_play_id","round_number")
);
--> statement-breakpoint
ALTER TABLE "map_play_players" ADD CONSTRAINT "map_play_players_map_play_id_map_plays_id_fk" FOREIGN KEY ("map_play_id") REFERENCES "public"."map_plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_play_players" ADD CONSTRAINT "map_play_players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_plays" ADD CONSTRAINT "map_plays_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_player_summaries" ADD CONSTRAINT "round_player_summaries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_player_summaries" ADD CONSTRAINT "round_player_summaries_map_play_id_round_number_round_summaries_map_play_id_round_number_fk" FOREIGN KEY ("map_play_id","round_number") REFERENCES "public"."round_summaries"("map_play_id","round_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_summaries" ADD CONSTRAINT "round_summaries_map_play_id_map_plays_id_fk" FOREIGN KEY ("map_play_id") REFERENCES "public"."map_plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_play_players_account_idx" ON "map_play_players" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "map_plays_server_idx" ON "map_plays" USING btree ("server_id","started_at");--> statement-breakpoint
CREATE INDEX "round_events_round_idx" ON "round_events" USING btree ("map_play_id","round_number","occurred_at");--> statement-breakpoint
CREATE INDEX "round_events_actor_idx" ON "round_events" USING btree ("actor_account_id") WHERE "round_events"."actor_account_id" is not null;--> statement-breakpoint
CREATE INDEX "round_events_target_idx" ON "round_events" USING btree ("target_account_id") WHERE "round_events"."target_account_id" is not null;--> statement-breakpoint
CREATE INDEX "round_events_assist_idx" ON "round_events" USING btree ("assist_account_id") WHERE "round_events"."assist_account_id" is not null;--> statement-breakpoint
CREATE INDEX "round_player_summaries_account_idx" ON "round_player_summaries" USING btree ("account_id");--> statement-breakpoint
-- Os eventos brutos de round são particionados por mês UTC (S17, ADR 0024). O Drizzle não descreve partição, então ela
-- é declarada aqui. O mês corrente e os dois próximos já nascem; depois a API cria o mês de cada evento que chega e o
-- RetentionJob mantém os próximos criados e solta os que passam de 12 meses (stats/round-event-partitions.ts).
DO $$
DECLARE
	first_day date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
	month_start date;
BEGIN
	FOR i IN 0..2 LOOP
		month_start := (first_day + make_interval(months => i))::date;
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF round_events FOR VALUES FROM (%L) TO (%L)',
			'round_events_y' || to_char(month_start, 'YYYY') || 'm' || to_char(month_start, 'MM'),
			month_start::text || ' 00:00:00+00',
			(month_start + interval '1 month')::date::text || ' 00:00:00+00'
		);
	END LOOP;
END
$$;
