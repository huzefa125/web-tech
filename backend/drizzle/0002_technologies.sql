CREATE TABLE "technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"category" varchar(20) NOT NULL,
	"version" varchar(40),
	"confidence" integer DEFAULT 50 NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "technologies" ADD CONSTRAINT "technologies_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_technologies_scan_name" ON "technologies" USING btree ("scan_id","name");--> statement-breakpoint
CREATE INDEX "ix_technologies_scan" ON "technologies" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "ix_technologies_name" ON "technologies" USING btree ("name");