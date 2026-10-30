CREATE TABLE "account_rating_daily" (
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"mode" "game_mode" NOT NULL,
	"map" text DEFAULT '' NOT NULL,
	"side" "game_team" NOT NULL,
	"rounds" integer NOT NULL,
	"kills" integer NOT NULL,
	"survived_rounds" integer NOT NULL,
	"kast_rounds" integer NOT NULL,
	"damage" integer NOT NULL,
	"opening_kills" integer NOT NULL,
	"opening_deaths" integer NOT NULL,
	"mk2" integer NOT NULL,
	"mk3" integer NOT NULL,
	"mk4" integer NOT NULL,
	"mk5" integer NOT NULL,
	"cw1" integer NOT NULL,
	"cw2" integer NOT NULL,
	"cw3" integer NOT NULL,
	"cw4" integer NOT NULL,
	"cw5" integer NOT NULL,
	CONSTRAINT "account_rating_daily_account_id_day_mode_map_side_pk" PRIMARY KEY("account_id","day","mode","map","side")
);
--> statement-breakpoint
CREATE TABLE "rating_population" (
	"version" smallint NOT NULL,
	"week_start" date NOT NULL,
	"mode" "game_mode" NOT NULL,
	"side" "game_team" NOT NULL,
	"accounts" integer NOT NULL,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"mean_kills" double precision NOT NULL,
	"mean_survival" double precision NOT NULL,
	"mean_kast" double precision NOT NULL,
	"mean_damage" double precision NOT NULL,
	"mean_impact" double precision NOT NULL,
	"sd_kills" double precision NOT NULL,
	"sd_survival" double precision NOT NULL,
	"sd_kast" double precision NOT NULL,
	"sd_damage" double precision NOT NULL,
	"sd_impact" double precision NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_population_version_week_start_mode_side_pk" PRIMARY KEY("version","week_start","mode","side")
);
--> statement-breakpoint
ALTER TABLE "account_rating_daily" ADD CONSTRAINT "account_rating_daily_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_rating_daily_mode_day_idx" ON "account_rating_daily" USING btree ("mode","day");