import { z } from "zod";

import { connectorSourceTypeSchema } from "../connectors/types";
import { assetClassSchema, evidenceEnvelopeSchema } from "../shared";

export const findingCategories = ["certificate", "tls"] as const;

export const findingCategorySchema = z.enum(findingCategories);

export const findingCodes = [
  "certificate_expired",
  "certificate_expiring_soon",
  "tls_outdated_protocol",
  "tls_weak_cipher",
] as const;

export const findingCodeSchema = z.enum(findingCodes);

export const findingSchema = z.object({
  id: z.string().min(1),
  snapshotId: z.string().min(1),
  scanJobId: z.string().min(1),
  scanAttemptId: z.string().min(1),
  tenantId: z.string().min(1),
  assetId: z.string().min(1),
  assetClass: assetClassSchema,
  category: findingCategorySchema,
  code: findingCodeSchema,
  title: z.string().min(1),
  rationale: z.string().min(1),
  sourceType: connectorSourceTypeSchema,
  sourceRef: z.string().min(1),
  evidence: evidenceEnvelopeSchema,
  detectedAt: z.date(),
});

export type FindingCategory = z.infer<typeof findingCategorySchema>;
export type FindingCode = z.infer<typeof findingCodeSchema>;
export type Finding = z.infer<typeof findingSchema>;
