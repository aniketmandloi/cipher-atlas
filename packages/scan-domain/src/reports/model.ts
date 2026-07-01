import type { CoverageSummary, RedactedCoverageSlice } from "../orchestration/coverage";
import type {
  CoverageOverall,
  ReportCoverageSlice,
  ReportFindingRow,
  ReportModel,
  ReportSummary,
} from "./contracts";

export interface BuildReportModelFindingInput {
  category: ReportFindingRow["category"];
  code: string;
  title: string;
  riskLevel: ReportFindingRow["riskLevel"];
  replacementPriority: ReportFindingRow["replacementPriority"];
  sourceType: ReportFindingRow["sourceType"];
  sourceRef: string;
  assetIdentifier: string | null;
  nistMapping: {
    mappingType: NonNullable<ReportFindingRow["nistMappingType"]>;
    references: Array<{ id: string; title: string; url?: string }>;
  } | null;
  evidenceLocator: string;
}

export interface BuildReportModelInput {
  scan: {
    id: string;
    completedAt: Date | null;
    connectorScope: string[];
  };
  snapshot: {
    id: string;
    publishedAt: Date;
    assetCount: number;
  };
  coverageSummary: CoverageSummary;
  coverageSlices: RedactedCoverageSlice[];
  summary: Omit<ReportSummary, "assetCount"> & { assetCount?: number };
  findings: BuildReportModelFindingInput[];
  generatedAt: Date;
}

export function coverageStatementForOverall(overall: CoverageOverall): string {
  switch (overall) {
    case "full":
      return "Full coverage: all selected sources were scanned.";
    case "partial":
      return "Partial coverage: some selected sources were not fully scanned.";
    case "failed":
      return "Scan coverage failed: selected sources could not be scanned.";
    case "empty":
      return "No coverage data available for this scan.";
  }
}

function mapCoverageSlice(slice: RedactedCoverageSlice): ReportCoverageSlice {
  return {
    connectorDisplayName: slice.connectorDisplayName,
    sourceType: slice.sourceType,
    segmentLabel: slice.segmentLabel,
    coverageStatus: slice.coverageStatus,
    detailMessage: slice.detailMessage,
  };
}

function mapFindingRow(finding: BuildReportModelFindingInput): ReportFindingRow {
  return {
    category: finding.category,
    code: finding.code,
    title: finding.title,
    riskLevel: finding.riskLevel,
    replacementPriority: finding.replacementPriority,
    sourceType: finding.sourceType,
    sourceRef: finding.sourceRef,
    assetIdentifier: finding.assetIdentifier,
    nistPrimaryReferenceId: finding.nistMapping?.references[0]?.id ?? null,
    nistMappingType: finding.nistMapping?.mappingType ?? null,
    evidenceLocator: finding.evidenceLocator,
  };
}

export function buildReportModel(input: BuildReportModelInput): ReportModel {
  const overall = input.coverageSummary.overall;

  return {
    scan: {
      id: input.scan.id,
      completedAt: input.scan.completedAt,
      connectorScope: input.scan.connectorScope,
    },
    snapshot: {
      id: input.snapshot.id,
      publishedAt: input.snapshot.publishedAt,
    },
    coverage: {
      overall,
      statement: coverageStatementForOverall(overall),
      slices: input.coverageSlices.map(mapCoverageSlice),
    },
    summary: {
      ...input.summary,
      assetCount: input.summary.assetCount ?? input.snapshot.assetCount,
    },
    findings: input.findings.map(mapFindingRow),
    generatedAt: input.generatedAt,
  };
}
