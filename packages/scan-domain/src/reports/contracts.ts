import { z } from "zod";

import { connectorSourceTypeSchema } from "../connectors/types";
import {
  findingCategorySchema,
  nistMappingTypeSchema,
  replacementPrioritySchema,
  riskLevelSchema,
} from "../findings/contracts";
import { assetClassSchema } from "../shared";

export const coverageOverallValues = ["full", "partial", "failed", "empty"] as const;

export const coverageOverallSchema = z.enum(coverageOverallValues);

export const reportCoverageSliceSchema = z.object({
  connectorDisplayName: z.string(),
  sourceType: connectorSourceTypeSchema.nullable(),
  segmentLabel: z.string().nullable(),
  coverageStatus: z.enum(["completed", "partial", "failed", "skipped", "unsupported"]),
  detailMessage: z.string().nullable(),
});

export const reportFindingRowSchema = z.object({
  category: findingCategorySchema,
  code: z.string().min(1),
  title: z.string().min(1),
  riskLevel: riskLevelSchema,
  replacementPriority: replacementPrioritySchema.nullable(),
  sourceType: connectorSourceTypeSchema,
  sourceRef: z.string().min(1),
  assetIdentifier: z.string().nullable(),
  nistPrimaryReferenceId: z.string().nullable(),
  nistMappingType: nistMappingTypeSchema.nullable(),
  evidenceLocator: z.string().min(1),
});

export const reportSummarySchema = z.object({
  totalFindings: z.number().int().min(0),
  categoryCounts: z.record(findingCategorySchema, z.number().int().min(0)),
  riskLevelCounts: z.record(riskLevelSchema, z.number().int().min(0)),
  standardsRelevantCount: z.number().int().min(0),
  sourceCounts: z.array(
    z.object({
      sourceType: connectorSourceTypeSchema,
      count: z.number().int().min(0),
    }),
  ),
  assetClassCounts: z.array(
    z.object({
      assetClass: assetClassSchema,
      count: z.number().int().min(0),
    }),
  ),
  assetCount: z.number().int().min(0),
});

export const reportModelSchema = z.object({
  scan: z.object({
    id: z.string().min(1),
    completedAt: z.date().nullable(),
    connectorScope: z.array(z.string()),
  }),
  snapshot: z.object({
    id: z.string().min(1),
    publishedAt: z.date(),
  }),
  coverage: z.object({
    overall: coverageOverallSchema,
    statement: z.string().min(1),
    slices: z.array(reportCoverageSliceSchema),
  }),
  summary: reportSummarySchema,
  findings: z.array(reportFindingRowSchema),
  generatedAt: z.date(),
});

export type CoverageOverall = z.infer<typeof coverageOverallSchema>;
export type ReportCoverageSlice = z.infer<typeof reportCoverageSliceSchema>;
export type ReportFindingRow = z.infer<typeof reportFindingRowSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type ReportModel = z.infer<typeof reportModelSchema>;
