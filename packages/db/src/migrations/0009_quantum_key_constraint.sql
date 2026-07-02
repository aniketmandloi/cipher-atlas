ALTER TABLE "finding" DROP CONSTRAINT "finding_category_code_match";--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_category_code_match" CHECK (("finding"."category" = 'certificate' AND "finding"."code"::text IN ('certificate_expired', 'certificate_expiring_soon', 'certificate_quantum_vulnerable_key'))
          OR ("finding"."category" = 'tls' AND "finding"."code"::text IN ('tls_outdated_protocol', 'tls_weak_cipher'))
          OR ("finding"."category" = 'dependency' AND "finding"."code"::text IN ('dependency_vulnerable_package'))
          OR ("finding"."category" = 'hndl' AND "finding"."code"::text IN ('hndl_exposure')));
