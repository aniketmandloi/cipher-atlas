import { db } from "@cipher-atlas/db";
import { connector } from "@cipher-atlas/db/schema/connector";
import { finding } from "@cipher-atlas/db/schema/finding";
import { asset, scanSnapshot } from "@cipher-atlas/db/schema/inventory";
import { scanJob } from "@cipher-atlas/db/schema/scan";
import { and, desc, eq } from "drizzle-orm";

import { protectedProcedure, router } from "../index";
import { buildFacetCounts } from "./findings";
import { tenantScope } from "../tenant";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const certificateExpiryBuckets = ["expired", "30d", "90d", "1y", "later", "unknown"] as const;
export type CertificateExpiryBucket = (typeof certificateExpiryBuckets)[number];

function bucketCertificateExpiry(notAfter: Date | null, now: Date): CertificateExpiryBucket {
  if (!notAfter) {
    return "unknown";
  }

  const deltaMs = notAfter.getTime() - now.getTime();
  if (deltaMs <= 0) {
    return "expired";
  }
  if (deltaMs <= 30 * DAY_MS) {
    return "30d";
  }
  if (deltaMs <= 90 * DAY_MS) {
    return "90d";
  }
  if (deltaMs <= 365 * DAY_MS) {
    return "1y";
  }
  return "later";
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const now = new Date();

    const connectorRows = await db
      .select({ status: connector.status })
      .from(connector)
      .where(eq(connector.tenantId, tenantId));

    const recentScanRows = await db
      .select({
        id: scanJob.id,
        status: scanJob.status,
        queuedAt: scanJob.queuedAt,
        completedAt: scanJob.completedAt,
        failedAt: scanJob.failedAt,
      })
      .from(scanJob)
      .where(eq(scanJob.tenantId, tenantId))
      .orderBy(desc(scanJob.queuedAt))
      .limit(5);

    const [latestSnapshotRow] = await db
      .select({
        snapshotId: scanSnapshot.id,
        scanId: scanSnapshot.scanJobId,
        publishedAt: scanSnapshot.publishedAt,
        assetCount: scanSnapshot.assetCount,
      })
      .from(scanSnapshot)
      .where(eq(scanSnapshot.tenantId, tenantId))
      .orderBy(desc(scanSnapshot.publishedAt))
      .limit(1);

    let latestSnapshot = null;
    if (latestSnapshotRow) {
      const facetRows = await db
        .select({
          category: finding.category,
          sourceType: finding.sourceType,
          assetClass: finding.assetClass,
          riskLevel: finding.riskLevel,
          nistMapping: finding.nistMapping,
        })
        .from(finding)
        .where(and(eq(finding.snapshotId, latestSnapshotRow.snapshotId), eq(finding.tenantId, tenantId)));

      const facetCounts = buildFacetCounts(facetRows);

      const certificateRows = await db
        .select({ evidence: asset.evidence })
        .from(asset)
        .where(
          and(
            eq(asset.snapshotId, latestSnapshotRow.snapshotId),
            eq(asset.tenantId, tenantId),
            eq(asset.assetClass, "certificate"),
          ),
        );

      const certificateExpiry: Record<CertificateExpiryBucket, number> = {
        expired: 0,
        "30d": 0,
        "90d": 0,
        "1y": 0,
        later: 0,
        unknown: 0,
      };
      for (const row of certificateRows) {
        const evidence = row.evidence as { certificate?: { notAfter?: unknown } } | null;
        certificateExpiry[bucketCertificateExpiry(coerceDate(evidence?.certificate?.notAfter), now)] += 1;
      }

      latestSnapshot = {
        scanId: latestSnapshotRow.scanId,
        snapshotId: latestSnapshotRow.snapshotId,
        publishedAt: latestSnapshotRow.publishedAt,
        assetCount: latestSnapshotRow.assetCount,
        totalFindings: facetRows.length,
        riskLevelCounts: facetCounts.riskLevelCounts,
        categoryCounts: facetCounts.categoryCounts,
        certificateCount: certificateRows.length,
        certificateExpiry,
      };
    }

    return {
      connectors: {
        total: connectorRows.length,
        usable: connectorRows.filter((row) => row.status === "usable").length,
      },
      latestScan: recentScanRows[0] ?? null,
      recentScans: recentScanRows,
      latestSnapshot,
    };
  }),
});
