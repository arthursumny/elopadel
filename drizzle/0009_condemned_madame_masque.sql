ALTER TABLE "notifications" ADD COLUMN "href" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "last_played_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "inactivity_penalty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "is_inactive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_room_unique" ON "matches" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_key_unique" ON "notifications" USING btree ("dedupe_key");