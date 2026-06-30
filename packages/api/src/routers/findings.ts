import { db } from "@cipher-atlas/db";
import { finding } from "@cipher-atlas/db/schema/finding";
import { asset, scanSnapshot } from "@cipher-atlas/db/schema/inventory";
import { scanJob } from "@cipher-atlas/db/schema/scan";
import {
  assetClassSchema,
  connectorSourceTypeSchema,
  findingCategorySchema,
  riskLevelSchema,
  type AssetClass,
  type FindingCategory,
  type FindingCode,
  type ReplacementPriority,
  type RiskLevel,
} from "@cipher-atlas/scan-domain";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { tenantScope } from "../tenant";

const listFindingsInputSchema = z.object({
  scanId: z.string().min(1),
  category: findingCategorySchema.optional(),
  sourceType: connectorSourceTypeSchema.optional(),
  assetClass: assetClassSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const getFindingInputSchema = z.object({
  scanId: z.string().min(1),
  findingId: z.string().min(1),
});

type ConnectorSourceType = z.infer<typeof connectorSourceTypeSchema>;

interface InventoryEvidenceEnvelope {
  sourceRef: string;
  locator: string;
  capturedAt: Date | string;
  redacted: boolean;
  redaction: {
    fields: string[];
    rulesApplied: string[];
  };
  metadata: Record<string, unknown>;
  certificate?: {
    serialNumber: string;
    subject: string;
    issuer: string;
    notBefore: Date | string;
    notAfter: Date | string;
    fingerprint: string;
  };
}

export interface ProjectedFindingEvidence {
  sourceRef: string;
  locator: string;
  capturedAt: Date | string;
  redacted: boolean;
  redaction: {
    fields: string[];
    rulesApplied: string[];
  };
  certificate?: InventoryEvidenceEnvelope["certificate"];
}

function emptyCategoryCounts(): Record<FindingCategory, number> {
  return {
    certificate: 0,
    tls: 0,
    dependency: 0,
    hndl: 0,
  };
}

function emptyRiskLevelCounts(): Record<RiskLevel, number> {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
}

function projectEvidence(evidence: InventoryEvidenceEnvelope): ProjectedFindingEvidence {
  const projected: ProjectedFindingEvidence = {
    sourceRef: evidence.sourceRef,
    locator: evidence.locator,
    capturedAt: evidence.capturedAt,
    redacted: evidence.redacted,
    redaction: evidence.redaction,
  };

  if (evidence.certificate) {
    projected.certificate = evidence.certificate;
  }

  return projected;
}

function buildFacetCounts(
  rows: Array<{
    category: FindingCategory;
    sourceType: ConnectorSourceType;
    assetClass: AssetClass;
    riskLevel: RiskLevel;
  }>,
) {
  const categoryCounts = emptyCategoryCounts();
  const riskLevelCounts = emptyRiskLevelCounts();
  const sourceCountMap = new Map<ConnectorSourceType, number>();
  const assetClassCountMap = new Map<AssetClass, number>();

  for (const row of rows) {
    categoryCounts[row.category] += 1;
    riskLevelCounts[row.riskLevel] += 1;
    sourceCountMap.set(row.sourceType, (sourceCountMap.get(row.sourceType) ?? 0) + 1);
    assetClassCountMap.set(row.assetClass, (assetClassCountMap.get(row.assetClass) ?? 0) + 1);
  }

  return {
    categoryCounts,
    riskLevelCounts,
    sourceCounts: [...sourceCountMap.entries()].map(([sourceType, facetCount]) => ({
      sourceType,
      count: facetCount,
    })),
    assetClassCounts: [...assetClassCountMap.entries()].map(([assetClass, facetCount]) => ({
      assetClass,
      count: facetCount,
    })),
  };
}

function buildFilterConditions(
  snapshotId: string,
  tenantId: string,
  filters: {
    category?: FindingCategory;
    sourceType?: ConnectorSourceType;
    assetClass?: AssetClass;
    riskLevel?: RiskLevel;
  },
): SQL[] {
  const conditions: SQL[] = [eq(finding.snapshotId, snapshotId), eq(finding.tenantId, tenantId)];

  if (filters.category) {
    conditions.push(eq(finding.category, filters.category));
  }
  if (filters.sourceType) {
    conditions.push(eq(finding.sourceType, filters.sourceType));
  }
  if (filters.assetClass) {
    conditions.push(eq(finding.assetClass, filters.assetClass));
  }
  if (filters.riskLevel) {
    conditions.push(eq(finding.riskLevel, filters.riskLevel));
  }

  return conditions;
}

export const findingsRouter = router({
  list: protectedProcedure.input(listFindingsInputSchema).query(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);

    const [scanRow] = await db
      .select({
        id: scanJob.id,
        status: scanJob.status,
        completedAt: scanJob.completedAt,
      })
      .from(scanJob)
      .where(and(eq(scanJob.id, input.scanId), eq(scanJob.tenantId, tenantId)))
      .limit(1);

    if (!scanRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Scan not found",
      });
    }

    if (scanRow.status !== "completed") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Findings are available only after a scan completes.",
      });
    }

    const [snapshotRow] = await db
      .select({
        id: scanSnapshot.id,
        publishedAt: scanSnapshot.publishedAt,
        assetCount: scanSnapshot.assetCount,
      })
      .from(scanSnapshot)
      .where(and(eq(scanSnapshot.scanJobId, input.scanId), eq(scanSnapshot.tenantId, tenantId)))
      .limit(1);

    const filters = {
      category: input.category,
      sourceType: input.sourceType,
      assetClass: input.assetClass,
      riskLevel: input.riskLevel,
    };

    if (!snapshotRow) {
      return {
        scan: {
          id: scanRow.id,
          status: "completed" as const,
          completedAt: scanRow.completedAt,
        },
        snapshot: null,
        filters,
        facetCounts: {
          categoryCounts: emptyCategoryCounts(),
          riskLevelCounts: emptyRiskLevelCounts(),
          sourceCounts: [] as Array<{ sourceType: ConnectorSourceType; count: number }>,
          assetClassCounts: [] as Array<{ assetClass: AssetClass; count: number }>,
        },
        items: [] as FindingsBrowseItem[],
        page: {
          limit: input.limit,
          offset: input.offset,
          returned: 0,
          filteredTotal: 0,
        },
      };
    }

    const facetRows = await db
      .select({
        category: finding.category,
        sourceType: finding.sourceType,
        assetClass: finding.assetClass,
        riskLevel: finding.riskLevel,
      })
      .from(finding)
      .where(and(eq(finding.snapshotId, snapshotRow.id), eq(finding.tenantId, tenantId)));

    const facetCounts = buildFacetCounts(facetRows);
    const filterConditions = buildFilterConditions(snapshotRow.id, tenantId, filters);

    const [filteredCountRow] = await db
      .select({ total: count() })
      .from(finding)
      .where(and(...filterConditions));

    const filteredTotal = Number(filteredCountRow?.total ?? 0);

    const listRows = await db
      .select({
        id: finding.id,
        snapshotId: finding.snapshotId,
        assetId: finding.assetId,
        assetClass: finding.assetClass,
        category: finding.category,
        code: finding.code,
        title: finding.title,
        rationale: finding.rationale,
        sourceType: finding.sourceType,
        sourceRef: finding.sourceRef,
        evidence: finding.evidence,
        detectedAt: finding.detectedAt,
        riskLevel: finding.riskLevel,
        replacementPriority: finding.replacementPriority,
        assetIdentifier: asset.identifier,
        connectorDisplayName: asset.connectorDisplayName,
      })
      .from(finding)
      .innerJoin(asset, eq(finding.assetId, asset.id))
      .where(and(...filterConditions))
      .orderBy(
        asc(finding.riskLevel),
        asc(finding.replacementPriority),
        asc(finding.category),
        asc(finding.code),
        asc(finding.sourceRef),
        asc(finding.id),
      )
      .limit(input.limit)
      .offset(input.offset);

    const items: FindingsBrowseItem[] = listRows.map((row) => ({
      id: row.id,
      snapshotId: row.snapshotId,
      assetId: row.assetId,
      assetIdentifier: row.assetIdentifier,
      assetClass: row.assetClass,
      category: row.category,
      code: row.code as FindingCode,
      title: row.title,
      rationale: row.rationale,
      sourceType: row.sourceType,
      sourceRef: row.sourceRef,
      connectorDisplayName: row.connectorDisplayName,
      evidence: projectEvidence(row.evidence),
      detectedAt: row.detectedAt,
      riskLevel: row.riskLevel,
      replacementPriority: row.replacementPriority,
    }));

    return {
      scan: {
        id: scanRow.id,
        status: "completed" as const,
        completedAt: scanRow.completedAt,
      },
      snapshot: {
        id: snapshotRow.id,
        publishedAt: snapshotRow.publishedAt,
        assetCount: snapshotRow.assetCount,
      },
      filters,
      facetCounts,
      items,
      page: {
        limit: input.limit,
        offset: input.offset,
        returned: items.length,
        filteredTotal,
      },
    };
  }),

  get: protectedProcedure.input(getFindingInputSchema).query(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);

    const [scanRow] = await db
      .select({
        id: scanJob.id,
        status: scanJob.status,
        completedAt: scanJob.completedAt,
      })
      .from(scanJob)
      .where(and(eq(scanJob.id, input.scanId), eq(scanJob.tenantId, tenantId)))
      .limit(1);

    if (!scanRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Scan not found",
      });
    }

    if (scanRow.status !== "completed") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Findings are available only after a scan completes.",
      });
    }

    const [snapshotRow] = await db
      .select({
        id: scanSnapshot.id,
        publishedAt: scanSnapshot.publishedAt,
      })
      .from(scanSnapshot)
      .where(and(eq(scanSnapshot.scanJobId, input.scanId), eq(scanSnapshot.tenantId, tenantId)))
      .limit(1);

    if (!snapshotRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Finding not found",
      });
    }

    const [findingRow] = await db
      .select({
        id: finding.id,
        snapshotId: finding.snapshotId,
        assetId: finding.assetId,
        assetClass: finding.assetClass,
        category: finding.category,
        code: finding.code,
        title: finding.title,
        rationale: finding.rationale,
        sourceType: finding.sourceType,
        sourceRef: finding.sourceRef,
        evidence: finding.evidence,
        detectedAt: finding.detectedAt,
        riskLevel: finding.riskLevel,
        replacementPriority: finding.replacementPriority,
        assetIdentifier: asset.identifier,
        connectorDisplayName: asset.connectorDisplayName,
      })
      .from(finding)
      .innerJoin(asset, eq(finding.assetId, asset.id))
      .where(
        and(
          eq(finding.id, input.findingId),
          eq(finding.tenantId, tenantId),
          eq(finding.snapshotId, snapshotRow.id),
        ),
      )
      .limit(1);

    if (!findingRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Finding not found",
      });
    }

    const findingItem: FindingsBrowseItem = {
      id: findingRow.id,
      snapshotId: findingRow.snapshotId,
      assetId: findingRow.assetId,
      assetIdentifier: findingRow.assetIdentifier,
      assetClass: findingRow.assetClass,
      category: findingRow.category,
      code: findingRow.code as FindingCode,
      title: findingRow.title,
      rationale: findingRow.rationale,
      sourceType: findingRow.sourceType,
      sourceRef: findingRow.sourceRef,
      connectorDisplayName: findingRow.connectorDisplayName,
      evidence: projectEvidence(findingRow.evidence),
      detectedAt: findingRow.detectedAt,
      riskLevel: findingRow.riskLevel,
      replacementPriority: findingRow.replacementPriority,
    };

    return {
      scan: {
        id: scanRow.id,
        status: "completed" as const,
        completedAt: scanRow.completedAt,
      },
      snapshot: {
        id: snapshotRow.id,
        publishedAt: snapshotRow.publishedAt,
      },
      finding: findingItem,
    };
  }),
});

export interface FindingsBrowseItem {
  id: string;
  snapshotId: string;
  assetId: string;
  assetIdentifier: string | null;
  assetClass: AssetClass;
  category: FindingCategory;
  code: FindingCode;
  title: string;
  rationale: string;
  sourceType: ConnectorSourceType;
  sourceRef: string;
  connectorDisplayName: string;
  evidence: ProjectedFindingEvidence;
  detectedAt: Date;
  riskLevel: RiskLevel;
  replacementPriority: ReplacementPriority | null;
}
