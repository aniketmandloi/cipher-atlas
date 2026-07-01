import { describe, expect, it } from "vitest";

import type { ReportModel } from "./contracts";
import { REPORT_CSV_HEADERS, renderReportCsv } from "./csv";

const generatedAt = new Date("2026-07-01T12:00:00.000Z");

function baseModel(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    scan: {
      id: "scan-1",
      completedAt: new Date("2026-06-30T10:00:00.000Z"),
      connectorScope: ["GitHub Prod"],
    },
    snapshot: {
      id: "snapshot-1",
      publishedAt: new Date("2026-06-30T10:05:00.000Z"),
    },
    coverage: {
      overall: "partial",
      statement: "Partial coverage: some selected sources were not fully scanned.",
      slices: [],
    },
    summary: {
      totalFindings: 2,
      categoryCounts: {
        certificate: 1,
        tls: 0,
        dependency: 1,
        hndl: 0,
      },
      riskLevelCounts: {
        critical: 0,
        high: 1,
        medium: 1,
        low: 0,
      },
      standardsRelevantCount: 2,
      sourceCounts: [{ sourceType: "github", count: 2 }],
      assetClassCounts: [{ assetClass: "certificate", count: 1 }],
      assetCount: 2,
    },
    findings: [
      {
        category: "certificate",
        code: "certificate_expired",
        title: "Expired certificate",
        riskLevel: "high",
        replacementPriority: "P1",
        sourceType: "github",
        sourceRef: "repo/cert.pem",
        assetIdentifier: "cert.example.com",
        nistPrimaryReferenceId: "NIST SP 1800-16",
        nistMappingType: "direct",
        evidenceLocator: "s3://evidence/cert",
      },
      {
        category: "dependency",
        code: "dependency_vulnerable",
        title: "Vulnerable package",
        riskLevel: "medium",
        replacementPriority: null,
        sourceType: "github",
        sourceRef: "repo/package-lock.json",
        assetIdentifier: null,
        nistPrimaryReferenceId: null,
        nistMappingType: null,
        evidenceLocator: "s3://evidence/dep",
      },
    ],
    generatedAt,
    ...overrides,
  };
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\r" && next === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((parsedRow) => parsedRow.some((cell) => cell.length > 0));
}

describe("renderReportCsv", () => {
  it("emits the stable header row and exact column count per data row", () => {
    const csv = renderReportCsv(baseModel()).toString("utf-8");
    const rows = parseCsv(csv);

    expect(rows[0]).toEqual([...REPORT_CSV_HEADERS]);
    expect(rows).toHaveLength(3);
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(REPORT_CSV_HEADERS.length);
    }
  });

  it("escapes commas, quotes, and newlines per RFC 4180", () => {
    const csv = renderReportCsv(
      baseModel({
        findings: [
          {
            category: "certificate",
            code: "certificate_expired",
            title: 'Title, with "quotes" and comma',
            riskLevel: "high",
            replacementPriority: "P1",
            sourceType: "github",
            sourceRef: "repo/cert\r\n.pem",
            assetIdentifier: "asset,one",
            nistPrimaryReferenceId: "NIST SP 1800-16",
            nistMappingType: "direct",
            evidenceLocator: "locator",
          },
        ],
      }),
    ).toString("utf-8");

    expect(csv).toContain('"Title, with ""quotes"" and comma"');
    expect(csv).toContain('"repo/cert\r\n.pem"');
    expect(csv).toContain('"asset,one"');
  });

  it("returns deterministic output for a fixed report model", () => {
    const model = baseModel();
    const first = renderReportCsv(model).toString("utf-8");
    const second = renderReportCsv(model).toString("utf-8");
    expect(first).toBe(second);
  });

  it("preserves finding order from the report model", () => {
    const csv = renderReportCsv(baseModel()).toString("utf-8");
    const rows = parseCsv(csv);
    expect(rows[1]?.[4]).toBe("certificate_expired");
    expect(rows[2]?.[4]).toBe("dependency_vulnerable");
  });

  it("renders headers only when there are zero findings", () => {
    const csv = renderReportCsv(baseModel({ findings: [] })).toString("utf-8");
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([...REPORT_CSV_HEADERS]);
  });

  it("does not include metadata or raw evidence fields in output", () => {
    const csv = renderReportCsv(baseModel()).toString("utf-8");
    expect(csv).not.toContain("metadata");
    expect(csv).not.toContain("must-not-leak");
    expect(csv).not.toContain("redaction");
  });

  it("serializes null replacement priority and NIST mapping as empty cells", () => {
    const csv = renderReportCsv(baseModel()).toString("utf-8");
    const rows = parseCsv(csv);
    expect(rows[2]?.[7]).toBe("");
    expect(rows[2]?.[12]).toBe("");
    expect(rows[2]?.[13]).toBe("");
  });

  it("repeats coverage_overall on every finding row", () => {
    const csv = renderReportCsv(baseModel()).toString("utf-8");
    const rows = parseCsv(csv);
    expect(rows[1]?.[14]).toBe("partial");
    expect(rows[2]?.[14]).toBe("partial");
  });
});
