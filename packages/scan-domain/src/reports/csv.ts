import type { ReportModel } from "./contracts";

export const REPORT_CSV_HEADERS = [
  "scan_id",
  "snapshot_id",
  "generated_at",
  "category",
  "finding_code",
  "title",
  "risk_level",
  "replacement_priority",
  "source_type",
  "source_ref",
  "asset_identifier",
  "evidence_locator",
  "nist_reference_id",
  "nist_mapping_type",
  "coverage_overall",
] as const;

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return escapeCsvField(value);
}

function formatFindingRow(model: ReportModel, finding: ReportModel["findings"][number]): string {
  return [
    formatCsvCell(model.scan.id),
    formatCsvCell(model.snapshot.id),
    formatCsvCell(model.generatedAt.toISOString()),
    formatCsvCell(finding.category),
    formatCsvCell(finding.code),
    formatCsvCell(finding.title),
    formatCsvCell(finding.riskLevel),
    formatCsvCell(finding.replacementPriority),
    formatCsvCell(finding.sourceType),
    formatCsvCell(finding.sourceRef),
    formatCsvCell(finding.assetIdentifier),
    formatCsvCell(finding.evidenceLocator),
    formatCsvCell(finding.nistPrimaryReferenceId),
    formatCsvCell(finding.nistMappingType),
    formatCsvCell(model.coverage.overall),
  ].join(",");
}

export function renderReportCsv(model: ReportModel): Buffer {
  const lines = [REPORT_CSV_HEADERS.join(",")];

  for (const finding of model.findings) {
    lines.push(formatFindingRow(model, finding));
  }

  const content = `${lines.join("\r\n")}\r\n`;
  return Buffer.from(content, "utf-8");
}
