import { z } from "zod";

import { connectorSourceTypeSchema } from "../connectors/types";
import { assetClassSchema, evidenceEnvelopeSchema } from "../shared";

export const findingCategories = ["certificate", "tls", "dependency", "hndl"] as const;

export const findingCategorySchema = z.enum(findingCategories);

export const findingCodes = [
  "certificate_expired",
  "certificate_expiring_soon",
  "tls_outdated_protocol",
  "tls_weak_cipher",
  "dependency_vulnerable_package",
  "hndl_exposure",
] as const;

export const findingCodeSchema = z.enum(findingCodes);

export const riskLevels = ["critical", "high", "medium", "low"] as const;

export const riskLevelSchema = z.enum(riskLevels);

export const replacementPriorities = ["P1", "P2", "P3", "P4"] as const;

export const replacementPrioritySchema = z.enum(replacementPriorities);

export const nistMappingTypes = ["direct", "interpretation"] as const;

export const nistMappingTypeSchema = z.enum(nistMappingTypes);

export const nistReferenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
});

export const nistMappingSchema = z.object({
  mappingType: nistMappingTypeSchema,
  references: z.array(nistReferenceSchema).min(1),
  summary: z.string().min(1),
});

const findingCodeCategoryMap: Record<(typeof findingCodes)[number], (typeof findingCategories)[number]> = {
  certificate_expired: "certificate",
  certificate_expiring_soon: "certificate",
  tls_outdated_protocol: "tls",
  tls_weak_cipher: "tls",
  dependency_vulnerable_package: "dependency",
  hndl_exposure: "hndl",
};

export const findingSchema = z
  .object({
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
    riskLevel: riskLevelSchema,
    replacementPriority: replacementPrioritySchema.nullable(),
    nistMapping: nistMappingSchema.nullable(),
  })
  .superRefine((val, ctx) => {
    if (findingCodeCategoryMap[val.code] !== val.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: `category "${val.category}" is not valid for code "${val.code}"`,
      });
    }
  });

export type FindingCategory = z.infer<typeof findingCategorySchema>;
export type FindingCode = z.infer<typeof findingCodeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type ReplacementPriority = z.infer<typeof replacementPrioritySchema>;
export type NistMappingType = z.infer<typeof nistMappingTypeSchema>;
export type NistReference = z.infer<typeof nistReferenceSchema>;
export type NistMapping = z.infer<typeof nistMappingSchema>;
export type Finding = z.infer<typeof findingSchema>;
