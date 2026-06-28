import { z } from "zod";

import type { ConnectorSourceType } from "../connectors/types";

export const coverageStatuses = [
  "completed",
  "partial",
  "failed",
  "skipped",
  "unsupported",
] as const;
export const coverageStatusSchema = z.enum(coverageStatuses);
export type CoverageStatus = (typeof coverageStatuses)[number];

export interface CoverageSliceRecord {
  id: string;
  scanJobId: string;
  scanAttemptId: string;
  tenantId: string;
  connectorId: string | null;
  connectorDisplayName: string;
  sourceType: ConnectorSourceType | null;
  segmentLabel: string | null;
  coverageStatus: CoverageStatus;
  detailMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedactedCoverageSlice {
  id: string;
  scanJobId: string;
  scanAttemptId: string;
  tenantId: string;
  connectorId: string | null;
  connectorDisplayName: string;
  sourceType: ConnectorSourceType | null;
  segmentLabel: string | null;
  coverageStatus: CoverageStatus;
  detailMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}

export interface CoverageSummary {
  overall: "full" | "partial" | "failed" | "empty";
  counts: Record<CoverageStatus, number>;
  total: number;
}

export function redactCoverageSlice(slice: CoverageSliceRecord): RedactedCoverageSlice {
  return {
    id: slice.id,
    scanJobId: slice.scanJobId,
    scanAttemptId: slice.scanAttemptId,
    tenantId: slice.tenantId,
    connectorId: slice.connectorId,
    connectorDisplayName: slice.connectorDisplayName,
    sourceType: slice.sourceType,
    segmentLabel: slice.segmentLabel,
    coverageStatus: slice.coverageStatus,
    detailMessage: slice.detailMessage,
    startedAt: slice.startedAt,
    completedAt: slice.completedAt,
    failedAt: slice.failedAt,
  };
}

export function summarizeCoverage(slices: CoverageSliceRecord[]): CoverageSummary {
  const counts: Record<CoverageStatus, number> = {
    completed: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
    unsupported: 0,
  };

  for (const slice of slices) {
    counts[slice.coverageStatus] += 1;
  }

  const total = slices.length;

  if (total === 0) {
    return { overall: "empty", counts, total };
  }

  if (counts.completed === total) {
    return { overall: "full", counts, total };
  }

  if (counts.completed > 0) {
    return { overall: "partial", counts, total };
  }

  return { overall: "failed", counts, total };
}

export function deriveScanTerminalStatus(slices: CoverageSliceRecord[]): "completed" | "failed" {
  const summary = summarizeCoverage(slices);

  if (summary.overall === "full" || summary.overall === "partial") {
    return "completed";
  }

  return "failed";
}
