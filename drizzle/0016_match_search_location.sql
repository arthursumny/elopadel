ALTER TABLE "match_searches" ADD COLUMN "state" text;
--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "country" text;
--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "initiator_location_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "partner_location_expires_at" timestamp with time zone;
