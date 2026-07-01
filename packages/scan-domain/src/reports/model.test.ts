import { describe, expect, it } from "vitest";

import { buildReportModel, coverageStatementForOverall } from "./model";
import type { BuildReportModelInput } from "./model";

const generatedAt = new Date("2026-07-01T12:00:00.000Z");

function baseInput(overrides: Partial<BuildReportModelInput> = {}): BuildReportModelInput {
  return {
    scan: {
      id: "scan-1",
      completedAt: new Date("2026-06-30T10:00:00.000Z"),
      connectorScope: ["GitHub Prod"],
    },
    snapshot: {
      id: "snapshot-1",
      publishedAt: new Date("2026-06-30T10:05:00.000Z"),
      assetCount: 4,
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
    coverageSlices: [
      {
        id: "slice-1",
        scanJobId: "scan-1",
        scanAttemptId: "attempt-1",
        tenantId: "tenant-1",
        connectorId: "conn-1",
        connectorDisplayName: "GitHub Prod",
        sourceType: "github",
        segmentLabel: null,
        coverageStatus: "completed",
        detailMessage: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
      },
    ],
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
      assetClassCounts: [
        { assetClass: "certificate", count: 1 },
        { assetClass: "dependency", count: 1 },
      ],
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
      {
        category: "dependency",
        code: "dependency_vulnerable_package",
        title: "Vulnerable package",
        riskLevel: "medium",
        replacementPriority: "P2",
        sourceType: "github",
        sourceRef: "repo/package.json",
        assetIdentifier: "api.example.com",
        nistMapping: {
          mappingType: "interpretation",
          references: [{ id: "NIST SP 800-131A Rev. 2", title: "Transitioning Cryptographic Algorithms" }],
          summary: "Transition affected algorithms.",
        },
        evidenceLocator: "s3://evidence/pkg",
      },
    ],
    generatedAt,
    ...overrides,
  };
}

describe("buildReportModel", () => {
  it("returns exact summary counts, coverage, standards relevance, and finding order", () => {
    const model = buildReportModel(baseInput());

    expect(model.summary.totalFindings).toBe(2);
    expect(model.summary.categoryCounts).toEqual({
      certificate: 1,
      tls: 0,
      dependency: 1,
      hndl: 0,
    });
    expect(model.summary.riskLevelCounts).toEqual({
      critical: 0,
      high: 1,
      medium: 1,
      low: 0,
    });
    expect(model.summary.standardsRelevantCount).toBe(2);
    expect(model.summary.assetCount).toBe(4);
    expect(model.coverage.overall).toBe("full");
    expect(model.coverage.statement).toBe(coverageStatementForOverall("full"));
    expect(model.findings).toHaveLength(2);
    expect(model.findings[0]?.title).toBe("Expired certificate");
    expect(model.findings[0]?.riskLevel).toBe("high");
    expect(model.findings[0]?.replacementPriority).toBe("P1");
    expect(model.findings[0]?.nistPrimaryReferenceId).toBe("NIST SP 1800-16");
    expect(model.findings[0]?.nistMappingType).toBe("direct");
    expect(model.findings[1]?.nistMappingType).toBe("interpretation");
    expect(model.generatedAt).toEqual(generatedAt);
  });

  it("is deep-equal for repeated calls with the same input and generatedAt", () => {
    const input = baseInput();
    const first = buildReportModel(input);
    const second = buildReportModel(input);
    expect(second).toEqual(first);
  });

  it("yields a partial coverage statement for partial snapshots", () => {
    const model = buildReportModel(
      baseInput({
        coverageSummary: {
          overall: "partial",
          counts: {
            completed: 1,
            partial: 1,
            failed: 0,
            skipped: 0,
            unsupported: 0,
          },
          total: 2,
        },
      }),
    );

    expect(model.coverage.overall).toBe("partial");
    expect(model.coverage.statement).toBe(coverageStatementForOverall("partial"));
    expect(model.coverage.statement).not.toContain("Full coverage");
  });

  it("does not include evidence metadata or secret fields on finding rows", () => {
    const model = buildReportModel(baseInput());
    for (const row of model.findings) {
      expect(row).not.toHaveProperty("metadata");
      expect(row).not.toHaveProperty("evidence");
      expect(Object.keys(row).sort()).toEqual(
        [
          "assetIdentifier",
          "category",
          "code",
          "evidenceLocator",
          "nistMappingType",
          "nistPrimaryReferenceId",
          "replacementPriority",
          "riskLevel",
          "sourceRef",
          "sourceType",
          "title",
        ].sort(),
      );
    }
  });
});
