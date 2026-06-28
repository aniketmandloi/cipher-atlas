CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "scan_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_job_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "scan_status" NOT NULL,
	"worker_id" text,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_message" text,
	"heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_job" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"failure_message" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_job_connector" (
	"scan_job_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"source_type" "connector_source_type" NOT NULL,
	"display_name" text NOT NULL,
	"status_at_launch" "connector_status" NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_job_connector_scan_job_id_connector_id_pk" PRIMARY KEY("scan_job_id","connector_id")
);
--> statement-breakpoint
ALTER TABLE "connector" ALTER COLUMN "last_validated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connector" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connector" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "connector" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connector" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "scan_attempt" ADD CONSTRAINT "scan_attempt_scan_job_id_scan_job_id_fk" FOREIGN KEY ("scan_job_id") REFERENCES "public"."scan_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_job" ADD CONSTRAINT "scan_job_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_job_connector" ADD CONSTRAINT "scan_job_connector_scan_job_id_scan_job_id_fk" FOREIGN KEY ("scan_job_id") REFERENCES "public"."scan_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_job_connector" ADD CONSTRAINT "scan_job_connector_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scan_attempt_scan_job_attempt_number_idx" ON "scan_attempt" USING btree ("scan_job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "scan_attempt_tenant_id_idx" ON "scan_attempt" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scan_attempt_scan_job_id_idx" ON "scan_attempt" USING btree ("scan_job_id");--> statement-breakpoint
CREATE INDEX "scan_job_tenant_id_idx" ON "scan_job" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scan_job_tenant_status_idx" ON "scan_job" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "scan_job_created_by_user_id_idx" ON "scan_job" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "scan_job_queued_idx" ON "scan_job" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "scan_job_connector_tenant_id_idx" ON "scan_job_connector" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scan_job_connector_connector_id_idx" ON "scan_job_connector" USING btree ("connector_id");