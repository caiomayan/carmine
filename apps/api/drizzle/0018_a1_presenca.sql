CREATE TABLE "server_presence_samples" (
	"server_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"players" integer NOT NULL,
	CONSTRAINT "server_presence_samples_server_id_at_pk" PRIMARY KEY("server_id","at")
);
--> statement-breakpoint
ALTER TABLE "server_presence_samples" ADD CONSTRAINT "server_presence_samples_server_id_game_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."game_servers"("id") ON DELETE cascade ON UPDATE no action;