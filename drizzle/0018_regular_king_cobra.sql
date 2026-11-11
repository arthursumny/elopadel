ALTER TABLE "matches" ADD COLUMN "booking_status" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "booked_court_name" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "gripo_schedule_id" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "booking_message" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "booked_at" timestamp with time zone;