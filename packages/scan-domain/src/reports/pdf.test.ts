import { describe, expect, it } from "vitest";

import { buildReportModel } from "./model";
import { renderReportPdf } from "./pdf";
import type { BuildReportModelInput } from "./model";

const generatedAt = new Date("2026-07-01T12:00:00.000Z");

function emptyModel(): ReturnType<typeof buildReportModel> {
  const input: BuildReportModelInput = {
    scan: {
      id: "scan-empty",
      completedAt: new Date("2026-06-30T10:00:00.000Z"),
      connectorScope: [],
    },
    snapshot: {
      id: "snapshot-empty",
      publishedAt: new Date("2026-06-30T10:05:00.000Z"),
      assetCount: 0,
    },
    coverageSummary: {
      overall: "empty",
      counts: {
        completed: 0,
        partial: 0,
        failed: 0,
        skipped: 0,
        unsupported: 0,
      },
      total: 0,
    },
    coverageSlices: [],
    summary: {
      totalFindings: 0,
      categoryCounts: {
        certificate: 0,
        tls: 0,
        dependency: 0,
        hndl: 0,
      },
      riskLevelCounts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      standardsRelevantCount: 0,
      sourceCounts: [],
      assetClassCounts: [],
    },
    findings: [],
    generatedAt,
  };

  return buildReportModel(input);
}

describe("renderReportPdf", () => {
  it("resolves to a non-empty buffer with a PDF header", async () => {
    const model = buildReportModel({
      scan: {
        id: "scan-1",
        completedAt: new Date("2026-06-30T10:00:00.000Z"),
        connectorScope: ["GitHub Prod"],
      },
      snapshot: {
        id: "snapshot-1",
        publishedAt: new Date("2026-06-30T10:05:00.000Z"),
        assetCount: 1,
      },
      coverageSummary: {
        overall: "full",
        counts: {
          completed: 1,
          partial: 0,
          failed: 0,
          skipped: 0,
          unsupported: 0,
        },
        total: 1,
      },
      coverageSlices: [],
      summary: {
        totalFindings: 1,
        categoryCounts: {
          certificate: 1,
          tls: 0,
          dependency: 0,
          hndl: 0,
        },
        riskLevelCounts: {
          critical: 0,
          high: 1,
          medium: 0,
          low: 0,
        },
        standardsRelevantCount: 1,
        sourceCounts: [{ sourceType: "github", count: 1 }],
        assetClassCounts: [{ assetClass: "certificate", count: 1 }],
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
          nistMapping: {
            mappingType: "direct",
            references: [{ id: "NIST SP 1800-16", title: "Securing Web Transactions" }],
            summary: "Replace expired certificate.",
          },
          evidenceLocator: "s3://evidence/cert",
        },
      ],
      generatedAt,
    });

    const buffer = await renderReportPdf(model);
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });

  it("renders a zero-finding model without throwing", async () => {
    await expect(renderReportPdf(emptyModel())).resolves.toBeInstanceOf(Buffer);
  });
});
