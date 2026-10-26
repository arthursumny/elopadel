ALTER TABLE "match_participants" ADD COLUMN "match_acceptance" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "match_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_rooms" ADD COLUMN "duration_minutes" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "side_preference" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "partner_side_preference" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "initiator_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_searches" ADD COLUMN "partner_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "result_deadline_at" timestamp with time zone;