DO $$ BEGIN
 CREATE TYPE "public"."finding_risk_level" AS ENUM('critical', 'high', 'medium', 'low');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."replacement_priority" AS ENUM('P1', 'P2', 'P3', 'P4');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN IF NOT EXISTS "risk_level" "finding_risk_level";--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN IF NOT EXISTS "replacement_priority" "replacement_priority";--> statement-breakpoint
UPDATE "finding" SET
  "risk_level" = CASE "code"
    WHEN 'hndl_exposure' THEN 'critical'::finding_risk_level
    WHEN 'certificate_expired' THEN 'high'::finding_risk_level
    WHEN 'tls_outdated_protocol' THEN 'high'::finding_risk_level
    WHEN 'dependency_vulnerable_package' THEN 'high'::finding_risk_level
    WHEN 'tls_weak_cipher' THEN 'medium'::finding_risk_level
    WHEN 'certificate_expiring_soon' THEN 'medium'::finding_risk_level
    ELSE 'low'::finding_risk_level
  END,
  "replacement_priority" = CASE "code"
    WHEN 'hndl_exposure' THEN 'P1'::replacement_priority
    WHEN 'certificate_expired' THEN 'P1'::replacement_priority
    WHEN 'tls_outdated_protocol' THEN 'P2'::replacement_priority
    WHEN 'dependency_vulnerable_package' THEN 'P2'::replacement_priority
    WHEN 'tls_weak_cipher' THEN 'P3'::replacement_priority
    WHEN 'certificate_expiring_soon' THEN 'P3'::replacement_priority
    ELSE NULL
  END
WHERE "risk_level" IS NULL;--> statement-breakpoint
ALTER TABLE "finding" ALTER COLUMN "risk_level" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finding_snapshot_risk_priority_idx" ON "finding" USING btree ("snapshot_id","risk_level","replacement_priority");
