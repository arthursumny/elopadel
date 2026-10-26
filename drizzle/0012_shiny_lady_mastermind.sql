CREATE TABLE "match_challenge_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"team" text DEFAULT 'A' NOT NULL,
	"acceptance" text DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"side_preference" text DEFAULT 'any' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"participant_key" text NOT NULL,
	"mode" text DEFAULT 'ranked' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"city" text NOT NULL,
	"club_id" uuid,
	"timezone_offset" integer DEFAULT 180 NOT NULL,
	"match_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_challenge_members" ADD CONSTRAINT "match_challenge_members_challenge_id_match_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."match_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_challenge_members" ADD CONSTRAINT "match_challenge_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_challenges" ADD CONSTRAINT "match_challenges_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_challenges" ADD CONSTRAINT "match_challenges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_challenge_member_unique" ON "match_challenge_members" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "match_challenge_member_user_idx" ON "match_challenge_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "match_challenge_participant_key_idx" ON "match_challenges" USING btree ("participant_key");--> statement-breakpoint
CREATE INDEX "match_challenge_status_starts_at_idx" ON "match_challenges" USING btree ("status","starts_at");