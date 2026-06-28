CREATE TYPE "public"."coverage_status" AS ENUM('completed', 'partial', 'failed', 'skipped', 'unsupported');--> statement-breakpoint
CREATE TABLE "coverage_slice" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_job_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"connector_id" text,
	"connector_display_name" text NOT NULL,
	"source_type" "connector_source_type",
	"segment_label" text,
	"coverage_status" "coverage_status" NOT NULL,
	"detail_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coverage_slice" ADD CONSTRAINT "coverage_slice_scan_job_id_scan_job_id_fk" FOREIGN KEY ("scan_job_id") REFERENCES "public"."scan_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_slice" ADD CONSTRAINT "coverage_slice_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coverage_slice_scan_job_id_idx" ON "coverage_slice" USING btree ("scan_job_id");--> statement-breakpoint
CREATE INDEX "coverage_slice_tenant_id_idx" ON "coverage_slice" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "coverage_slice_scan_job_coverage_status_idx" ON "coverage_slice" USING btree ("scan_job_id","coverage_status");