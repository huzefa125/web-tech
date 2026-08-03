CREATE TABLE "scan_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"kind" varchar(10) NOT NULL,
	"url" text NOT NULL,
	"storage_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"content_type" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"job_id" varchar(64),
	"final_url" text,
	"http_status" integer,
	"response_headers" jsonb,
	"load_time_ms" integer,
	"error_code" varchar(40),
	"error_message" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" bigint NOT NULL,
	"kind" varchar(20) DEFAULT 'viewport' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host" varchar(253) NOT NULL,
	"canonical_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_assets" ADD CONSTRAINT "scan_assets_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_scan_assets_scan_kind" ON "scan_assets" USING btree ("scan_id","kind");--> statement-breakpoint
CREATE INDEX "ix_scan_assets_sha" ON "scan_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "ix_scans_website_time" ON "scans" USING btree ("website_id","queued_at");--> statement-breakpoint
CREATE INDEX "ix_scans_requested_by" ON "scans" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "ix_scans_status" ON "scans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_screenshots_scan" ON "screenshots" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_websites_host" ON "websites" USING btree ("host");