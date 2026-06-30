ALTER TABLE "finding" ADD COLUMN IF NOT EXISTS "nist_mapping" jsonb;--> statement-breakpoint
UPDATE "finding" SET "nist_mapping" = CASE "code"
  WHEN 'certificate_expired' THEN '{"mappingType":"direct","references":[{"id":"NIST SP 1800-16","title":"Securing Web Transactions: TLS Server Certificate Management"}],"summary":"Expired certificate lifecycle management is directly addressed by TLS certificate management guidance; replace and re-issue."}'::jsonb
  WHEN 'certificate_expiring_soon' THEN '{"mappingType":"direct","references":[{"id":"NIST SP 1800-16","title":"Securing Web Transactions: TLS Server Certificate Management"}],"summary":"Renewal-before-expiry is directly addressed by TLS certificate management guidance; plan replacement within the renewal window."}'::jsonb
  WHEN 'tls_outdated_protocol' THEN '{"mappingType":"direct","references":[{"id":"NIST SP 800-52 Rev. 2","title":"Guidelines for the Selection, Configuration, and Use of TLS Implementations"}],"summary":"Protocols below TLS 1.2 are non-conformant with NIST TLS implementation guidance; upgrade to an approved protocol version."}'::jsonb
  WHEN 'tls_weak_cipher' THEN '{"mappingType":"direct","references":[{"id":"NIST SP 800-52 Rev. 2","title":"Guidelines for the Selection, Configuration, and Use of TLS Implementations"}],"summary":"Weak cipher suites are outside the NIST-approved configuration set; reconfigure to approved cipher suites."}'::jsonb
  WHEN 'dependency_vulnerable_package' THEN '{"mappingType":"interpretation","references":[{"id":"NIST SP 800-131A Rev. 2","title":"Transitioning the Use of Cryptographic Algorithms and Key Lengths"}],"summary":"Crypto-relevant package exposure is a product-interpreted signal to transition affected algorithms/libraries; no single normative statement names the package."}'::jsonb
  WHEN 'hndl_exposure' THEN '{"mappingType":"interpretation","references":[{"id":"NIST IR 8547","title":"Transition to Post-Quantum Cryptography Standards"}],"summary":"Harvest-now-decrypt-later is a product-interpreted post-quantum migration risk; align long-lived confidentiality with the PQC transition direction rather than a single conformance statement."}'::jsonb
  ELSE "nist_mapping"
END
WHERE "nist_mapping" IS NULL AND "code" IN (
  'certificate_expired',
  'certificate_expiring_soon',
  'tls_outdated_protocol',
  'tls_weak_cipher',
  'dependency_vulnerable_package',
  'hndl_exposure'
);
