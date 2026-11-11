ALTER TABLE "clubs" ADD COLUMN "gripo_club_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "club_gripo_id_unique" ON "clubs" USING btree ("gripo_club_id");