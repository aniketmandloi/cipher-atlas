import { z } from "zod";

import { connectorSourceTypeSchema } from "../connectors/types";

export const assetClasses = ["certificate", "tls_config", "dependency", "hndl_signal"] as const;

export const assetClassSchema = z.enum(assetClasses);

export const redactionMetadataSchema = z.object({
  fields: z.array(z.string()),
  rulesApplied: z.array(z.string()),
});

export const certificateLifecycleSchema = z.object({
  serialNumber: z.string(),
  subject: z.string(),
  issuer: z.string(),
  notBefore: z.date(),
  notAfter: z.date(),
  fingerprint: z.string(),
});

export const evidenceEnvelopeSchema = z.object({
  sourceRef: z.string().min(1),
  locator: z.string().min(1),
  capturedAt: z.date(),
  redacted: z.boolean(),
  redaction: redactionMetadataSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  certificate: certificateLifecycleSchema.optional(),
});

export const observationSchema = z.object({
  tenantId: z.string().min(1),
  snapshotId: z.string().min(1),
  scanJobId: z.string().min(1),
  scanAttemptId: z.string().min(1),
  connectorId: z.string().min(1),
  connectorDisplayName: z.string().min(1),
  sourceType: connectorSourceTypeSchema,
  sourceRef: z.string().min(1),
  assetClass: assetClassSchema,
  locator: z.string().min(1),
  capturedAt: z.date(),
  evidence: z.record(z.string(), z.unknown()).default({}),
  coverage: z
    .object({
      coverageSliceId: z.string().min(1).optional(),
      segmentLabel: z.string().nullable().optional(),
    })
    .optional(),
});

export const assetRecordSchema = z.object({
  id: z.string().min(1),
  snapshotId: z.string().min(1),
  scanJobId: z.string().min(1),
  scanAttemptId: z.string().min(1),
  tenantId: z.string().min(1),
  connectorId: z.string().min(1).nullable(),
  connectorDisplayName: z.string().min(1),
  sourceType: connectorSourceTypeSchema,
  assetClass: assetClassSchema,
  sourceRef: z.string().min(1),
  identifier: z.string().nullable(),
  evidence: evidenceEnvelopeSchema,
  capturedAt: z.date(),
});

export type AssetClass = z.infer<typeof assetClassSchema>;
export type RedactionMetadata = z.infer<typeof redactionMetadataSchema>;
export type CertificateLifecycle = z.infer<typeof certificateLifecycleSchema>;
export type EvidenceEnvelope = z.infer<typeof evidenceEnvelopeSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
