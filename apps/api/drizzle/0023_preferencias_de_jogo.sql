CREATE TABLE "account_game_preferences" (
	"account_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_game_preferences_account_id_mode_key_pk" PRIMARY KEY("account_id","mode","key")
);
--> statement-breakpoint
ALTER TABLE "account_game_preferences" ADD CONSTRAINT "account_game_preferences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;