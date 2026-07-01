import { db } from "@cipher-atlas/db";
import { coverageSlice, scanAttempt } from "@cipher-atlas/db/schema/scan";
import {
  redactCoverageSlice,
  summarizeCoverage,
  type CoverageSliceRecord,
  type CoverageSummary,
  type RedactedCoverageSlice,
} from "@cipher-atlas/scan-domain";
import { and, eq, inArray } from "drizzle-orm";

type ScanAttemptRow = typeof scanAttempt.$inferSelect;
type CoverageSliceRow = typeof coverageSlice.$inferSelect;

export function groupLatestAttemptIds(rows: ScanAttemptRow[]): Map<string, string> {
  const latestByScanId = new Map<string, ScanAttemptRow>();

  for (const row of rows) {
    const current = latestByScanId.get(row.scanJobId);
    if (!current || row.attemptNumber > current.attemptNumber) {
      latestByScanId.set(row.scanJobId, row);
    }
  }

  return new Map([...latestByScanId].map(([scanJobId, attempt]) => [scanJobId, attempt.id]));
}

export function groupCoverageSlices(rows: CoverageSliceRow[]): Map<string, CoverageSliceRecord[]> {
  const slicesByScanId = new Map<string, CoverageSliceRecord[]>();

  for (const row of rows) {
    const slices = slicesByScanId.get(row.scanJobId) ?? [];
    slices.push({
      id: row.id,
      scanJobId: row.scanJobId,
      scanAttemptId: row.scanAttemptId,
      tenantId: row.tenantId,
      connectorId: row.connectorId,
      connectorDisplayName: row.connectorDisplayName,
      sourceType: row.sourceType,
      segmentLabel: row.segmentLabel,
      coverageStatus: row.coverageStatus,
      detailMessage: row.detailMessage,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      failedAt: row.failedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    slicesByScanId.set(row.scanJobId, slices);
  }

  return slicesByScanId;
}

export interface ScanCoveragePayload {
  coverageSlices: RedactedCoverageSlice[];
  coverageSummary: CoverageSummary;
}

export async function loadScanCoverageForAttempt(
  scanJobId: string,
  scanAttemptId: string,
): Promise<ScanCoveragePayload> {
  const sliceRows = await db
    .select()
    .from(coverageSlice)
    .where(and(eq(coverageSlice.scanAttemptId, scanAttemptId), eq(coverageSlice.scanJobId, scanJobId)))
    .orderBy(coverageSlice.connectorDisplayName, coverageSlice.id);

  const redactedSlices = sliceRows.map(redactCoverageSlice);

  return {
    coverageSlices: redactedSlices,
    coverageSummary: summarizeCoverage(sliceRows),
  };
}

export async function loadScanCoverageForJob(scanJobId: string): Promise<ScanCoveragePayload> {
  const attemptRows = await db.select().from(scanAttempt).where(eq(scanAttempt.scanJobId, scanJobId));
  const latestAttemptIdByScanId = groupLatestAttemptIds(attemptRows);
  const latestAttemptId = latestAttemptIdByScanId.get(scanJobId);

  if (!latestAttemptId) {
    return {
      coverageSlices: [],
      coverageSummary: summarizeCoverage([]),
    };
  }

  const sliceRows = await db
    .select()
    .from(coverageSlice)
    .where(eq(coverageSlice.scanAttemptId, latestAttemptId))
    .orderBy(coverageSlice.connectorDisplayName, coverageSlice.id);

  const rawSlices = sliceRows.filter((row) => row.scanJobId === scanJobId);
  const redactedSlices = rawSlices.map(redactCoverageSlice);

  return {
    coverageSlices: redactedSlices,
    coverageSummary: summarizeCoverage(rawSlices),
  };
}

export async function loadScanCoverageForJobs(scanJobIds: string[]): Promise<Map<string, ScanCoveragePayload>> {
  if (scanJobIds.length === 0) {
    return new Map();
  }

  const attemptRows = await db.select().from(scanAttempt).where(inArray(scanAttempt.scanJobId, scanJobIds));
  const latestAttemptIdByScanId = groupLatestAttemptIds(attemptRows);
  const latestAttemptIds = [...latestAttemptIdByScanId.values()];
  const scanIdByLatestAttemptId = new Map(
    [...latestAttemptIdByScanId].map(([scanJobId, attemptId]) => [attemptId, scanJobId]),
  );

  const sliceRows =
    latestAttemptIds.length > 0
      ? await db
          .select()
          .from(coverageSlice)
          .where(inArray(coverageSlice.scanAttemptId, latestAttemptIds))
          .orderBy(coverageSlice.connectorDisplayName, coverageSlice.id)
      : [];

  const slicesByScanId = groupCoverageSlices(
    sliceRows.filter((row) => scanIdByLatestAttemptId.get(row.scanAttemptId) === row.scanJobId),
  );

  const result = new Map<string, ScanCoveragePayload>();

  for (const scanJobId of scanJobIds) {
    const rawSlices = slicesByScanId.get(scanJobId) ?? [];
    result.set(scanJobId, {
      coverageSlices: rawSlices.map(redactCoverageSlice),
      coverageSummary: summarizeCoverage(rawSlices),
    });
  }

  return result;
}
