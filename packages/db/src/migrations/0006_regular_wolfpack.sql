CREATE TYPE "public"."report_artifact_format" AS ENUM('pdf');--> statement-breakpoint
CREATE TABLE "report_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"scan_job_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"format" "report_artifact_format" NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"generated_by_user_id" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_artifact" ADD CONSTRAINT "report_artifact_snapshot_id_scan_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."scan_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_artifact" ADD CONSTRAINT "report_artifact_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifact_snapshot_format_idx" ON "report_artifact" USING btree ("snapshot_id","format");--> statement-breakpoint
CREATE INDEX "report_artifact_tenant_id_idx" ON "report_artifact" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "report_artifact_scan_job_id_idx" ON "report_artifact" USING btree ("scan_job_id");