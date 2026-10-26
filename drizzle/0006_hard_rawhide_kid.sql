ALTER TABLE "match_participants" ADD COLUMN "attendance" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "attendance_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "no_show_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "suspended_until" timestamp with time zone;