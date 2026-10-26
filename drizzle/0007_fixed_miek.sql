CREATE TABLE "match_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"partner_id" uuid,
	"party_type" text DEFAULT 'solo' NOT NULL,
	"mode" text DEFAULT 'ranked' NOT NULL,
	"status" text DEFAULT 'searching' NOT NULL,
	"preferred_dates" jsonb NOT NULL,
	"time_from" text NOT NULL,
	"time_to" text NOT NULL,
	"city" text NOT NULL,
	"club_id" uuid,
	"tier" text,
	"room_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"inviter_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_participants" ADD COLUMN "team" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
WITH ordered_participants AS (
	SELECT "id", row_number() OVER (PARTITION BY "room_id" ORDER BY "joined_at", "id") - 1 AS "position"
	FROM "room_participants"
)
UPDATE "room_participants" AS participants
SET "team" = CASE WHEN ordered."position" % 2 = 0 THEN 'A' ELSE 'B' END
FROM ordered_participants AS ordered
WHERE participants."id" = ordered."id";--> statement-breakpoint
ALTER TABLE "match_searches" ADD CONSTRAINT "match_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_searches" ADD CONSTRAINT "match_searches_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_searches" ADD CONSTRAINT "match_searches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_searches" ADD CONSTRAINT "match_searches_room_id_match_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."match_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_room_id_match_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."match_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_invitation_room_invitee_unique" ON "room_invitations" USING btree ("room_id","invitee_id");
