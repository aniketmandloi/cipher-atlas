import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, insertMock, loadCoverageMock, renderReportPdfMock, renderReportCsvMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  loadCoverageMock: vi.fn(),
  renderReportPdfMock: vi.fn(),
  renderReportCsvMock: vi.fn(),
}));

vi.mock("@cipher-atlas/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
}));

vi.mock("../lib/scan-coverage", () => ({
  loadScanCoverageForAttempt: loadCoverageMock,
}));

vi.mock("@cipher-atlas/scan-domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cipher-atlas/scan-domain")>();
  return {
    ...actual,
    renderReportPdf: renderReportPdfMock,
    renderReportCsv: renderReportCsvMock,
  };
});

import { reportsRouter } from "./reports";

const baseDate = new Date("2026-06-29T12:00:00.000Z");
const expiredPublishedAt = new Date("2024-01-01T00:00:00.000Z");

const RETENTION_ELAPSED_MESSAGE =
  "This scan's retention window has elapsed and its report is no longer available.";

describe("reports router generatePdf", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    loadCoverageMock.mockReset();
    loadCoverageMock.mockResolvedValue({
      coverageSlices: [],
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
    });
    insertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    renderReportPdfMock.mockReset();
    renderReportPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4"));
    renderReportCsvMock.mockReset();
    renderReportCsvMock.mockReturnValue(Buffer.from("scan_id,snapshot_id\r\n"));
  });

  it("returns not found for missing or cross-tenant scan ids", async () => {
    selectMock.mockReturnValueOnce(selectLimitRows([]));

    await expect(createCaller("user-1").generatePdf({ scanId: "scan-other-tenant" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan not found",
    } satisfies Partial<TRPCError>);
  });

  it("returns bad request for a non-completed scan", async () => {
    selectMock.mockReturnValueOnce(
      selectLimitRows([
        {
          id: "scan-1",
          status: "running",
          completedAt: null,
        },
      ]),
    );

    await expect(createCaller("user-1").generatePdf({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A report can be exported only after a scan completes.",
    } satisfies Partial<TRPCError>);
  });

  it("returns not found for a completed scan with no snapshot", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(selectLimitRows([]));

    await expect(createCaller("user-1").generatePdf({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan snapshot not found",
    } satisfies Partial<TRPCError>);
  });

  it("returns a pdf payload and upserts tenant-scoped artifact metadata", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    insertMock.mockReturnValue({ values });

    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: baseDate,
            assetCount: 2,
          },
        ]),
      )
      .mockReturnValueOnce(selectWhereRows([{ displayName: "GitHub Prod" }]))
      .mockReturnValueOnce(selectWhereRows(facetRows()))
      .mockReturnValueOnce(selectOrderByRows(findingRows()));

    const result = await createCaller("user-1").generatePdf({ scanId: "scan-1" });

    expect(result.contentType).toBe("application/pdf");
    expect(result.fileName).toBe("cipher-atlas-report-scan-1.pdf");
    expect(result.base64.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("metadata");

    expect(renderReportPdfMock).toHaveBeenCalledTimes(1);
    const reportModel = renderReportPdfMock.mock.calls[0]?.[0];
    expect(reportModel).toBeDefined();
    expect(JSON.stringify(reportModel)).not.toContain("must-not-leak");
    expect(reportModel?.findings[0]).toEqual(
      expect.objectContaining({
        evidenceLocator: "s3://evidence/cert",
      }),
    );
    expect(reportModel?.findings[0]).not.toHaveProperty("metadata");

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "user-1",
        scanJobId: "scan-1",
        snapshotId: "snapshot-1",
        format: "pdf",
        generatedByUserId: "user-1",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(loadCoverageMock).toHaveBeenCalledWith("scan-1", "attempt-1");
  });
});

describe("reports router generateCsv", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    loadCoverageMock.mockReset();
    loadCoverageMock.mockResolvedValue({
      coverageSlices: [],
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
    });
    insertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    renderReportCsvMock.mockReset();
    renderReportCsvMock.mockReturnValue(Buffer.from("scan_id,snapshot_id\r\n"));
  });

  it("returns not found for missing or cross-tenant scan ids", async () => {
    selectMock.mockReturnValueOnce(selectLimitRows([]));

    await expect(createCaller("user-1").generateCsv({ scanId: "scan-other-tenant" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan not found",
    } satisfies Partial<TRPCError>);
  });

  it("returns bad request for a non-completed scan", async () => {
    selectMock.mockReturnValueOnce(
      selectLimitRows([
        {
          id: "scan-1",
          status: "running",
          completedAt: null,
        },
      ]),
    );

    await expect(createCaller("user-1").generateCsv({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A report can be exported only after a scan completes.",
    } satisfies Partial<TRPCError>);
  });

  it("returns not found for a completed scan with no snapshot", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(selectLimitRows([]));

    await expect(createCaller("user-1").generateCsv({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan snapshot not found",
    } satisfies Partial<TRPCError>);
  });

  it("returns a csv payload and upserts tenant-scoped artifact metadata", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    insertMock.mockReturnValue({ values });

    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: baseDate,
            assetCount: 2,
          },
        ]),
      )
      .mockReturnValueOnce(selectWhereRows([{ displayName: "GitHub Prod" }]))
      .mockReturnValueOnce(selectWhereRows(facetRows()))
      .mockReturnValueOnce(selectOrderByRowsWithoutLimit(findingRows()));

    const result = await createCaller("user-1").generateCsv({ scanId: "scan-1" });

    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(result.fileName).toBe("cipher-atlas-findings-scan-1.csv");
    expect(result.base64.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("metadata");

    expect(renderReportCsvMock).toHaveBeenCalledTimes(1);
    const reportModel = renderReportCsvMock.mock.calls[0]?.[0];
    expect(reportModel).toBeDefined();
    expect(JSON.stringify(reportModel)).not.toContain("must-not-leak");
    expect(reportModel?.findings[0]).toEqual(
      expect.objectContaining({
        evidenceLocator: "s3://evidence/cert",
      }),
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "user-1",
        scanJobId: "scan-1",
        snapshotId: "snapshot-1",
        format: "csv",
        generatedByUserId: "user-1",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(loadCoverageMock).toHaveBeenCalledWith("scan-1", "attempt-1");
  });

  it("does not cap csv findings at the pdf table limit", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    insertMock.mockReturnValue({ values });

    const manyFindings = Array.from({ length: 55 }, (_, index) => ({
      ...findingRows()[0],
      code: `finding_${index}`,
      title: `Finding ${index}`,
    }));

    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: baseDate,
            assetCount: 55,
          },
        ]),
      )
      .mockReturnValueOnce(selectWhereRows([{ displayName: "GitHub Prod" }]))
      .mockReturnValueOnce(selectWhereRows(facetRows()))
      .mockReturnValueOnce(selectOrderByRowsWithoutLimit(manyFindings));

    await createCaller("user-1").generateCsv({ scanId: "scan-1" });

    const reportModel = renderReportCsvMock.mock.calls[0]?.[0];
    expect(reportModel?.findings).toHaveLength(55);
  });
});

describe("reports router retention enforcement", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    loadCoverageMock.mockReset();
    renderReportPdfMock.mockReset();
    renderReportCsvMock.mockReset();
  });

  it("rejects generatePdf when the snapshot is past retention", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: expiredPublishedAt,
            assetCount: 2,
          },
        ]),
      );

    await expect(createCaller("user-1").generatePdf({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: RETENTION_ELAPSED_MESSAGE,
    } satisfies Partial<TRPCError>);
  });

  it("rejects generateCsv when the snapshot is past retention", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: expiredPublishedAt,
            assetCount: 2,
          },
        ]),
      );

    await expect(createCaller("user-1").generateCsv({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: RETENTION_ELAPSED_MESSAGE,
    } satisfies Partial<TRPCError>);
  });

  it("rejects listArtifacts when the snapshot is past retention", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: expiredPublishedAt,
            assetCount: 2,
          },
        ]),
      );

    await expect(createCaller("user-1").listArtifacts({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: RETENTION_ELAPSED_MESSAGE,
    } satisfies Partial<TRPCError>);
  });
});

describe("reports router listArtifacts", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns not found for missing or cross-tenant scan ids", async () => {
    selectMock.mockReturnValueOnce(selectLimitRows([]));

    await expect(createCaller("user-1").listArtifacts({ scanId: "scan-other-tenant" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan not found",
    } satisfies Partial<TRPCError>);
  });

  it("returns bad request for a non-completed scan", async () => {
    selectMock.mockReturnValueOnce(
      selectLimitRows([
        {
          id: "scan-1",
          status: "running",
          completedAt: null,
        },
      ]),
    );

    await expect(createCaller("user-1").listArtifacts({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A report can be exported only after a scan completes.",
    } satisfies Partial<TRPCError>);
  });

  it("returns not found for a completed scan with no snapshot", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(selectLimitRows([]));

    await expect(createCaller("user-1").listArtifacts({ scanId: "scan-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan snapshot not found",
    } satisfies Partial<TRPCError>);
  });

  it("returns an empty artifact list for a completed scan with no generated reports", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: baseDate,
            assetCount: 2,
          },
        ]),
      )
      .mockReturnValueOnce(selectWhereRows([{ displayName: "GitHub Prod" }]))
      .mockReturnValueOnce(selectArtifactHistoryRows([]));

    const result = await createCaller("user-1").listArtifacts({ scanId: "scan-1" });

    expect(result.artifacts).toEqual([]);
    expect(result.snapshot).toEqual(
      expect.objectContaining({
        snapshotId: "snapshot-1",
        assetCount: 2,
        withinRetention: true,
      }),
    );
    expect(result.snapshot.retainedUntil).toBeInstanceOf(Date);
  });

  it("returns artifacts with retention metadata and tenant-scoped filtering", async () => {
    const artifactGeneratedAt = new Date("2026-06-30T08:00:00.000Z");
    const artifactRows = [
      {
        format: "csv" as const,
        byteSize: 2048,
        checksumSha256: "csv-checksum",
        generatedAt: artifactGeneratedAt,
        generatedByUserId: "user-1",
        createdAt: artifactGeneratedAt,
        userName: "Test User",
      },
      {
        format: "pdf" as const,
        byteSize: 4096,
        checksumSha256: "pdf-checksum",
        generatedAt: baseDate,
        generatedByUserId: "user-1",
        createdAt: baseDate,
        userName: "",
      },
    ];
    let capturedWhereCondition: unknown;
    const whereSpy = vi.fn((condition) => {
      capturedWhereCondition = condition;
      return {
        orderBy: vi.fn().mockResolvedValue(artifactRows),
      };
    });

    selectMock
      .mockReturnValueOnce(selectLimitRows([completedScanRow()]))
      .mockReturnValueOnce(
        selectLimitRows([
          {
            id: "snapshot-1",
            scanAttemptId: "attempt-1",
            publishedAt: baseDate,
            assetCount: 2,
          },
        ]),
      )
      .mockReturnValueOnce(selectWhereRows([{ displayName: "GitHub Prod" }]))
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: whereSpy,
          }),
        }),
      });

    const result = await createCaller("user-1").listArtifacts({ scanId: "scan-1" });

    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(sqlConditionContainsValue(capturedWhereCondition, "user-1")).toBe(true);
    expect(sqlConditionContainsValue(capturedWhereCondition, "snapshot-1")).toBe(true);
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0]).toEqual(
      expect.objectContaining({
        format: "csv",
        byteSize: 2048,
        generatedByName: "Test User",
        withinRetention: true,
      }),
    );
    expect(result.artifacts[1]).toEqual(
      expect.objectContaining({
        format: "pdf",
        generatedByName: "user-1",
      }),
    );
    expect(result.artifacts[0]).not.toHaveProperty("tenantId");
  });
});

describe("distinct-run snapshot preservation", () => {
  it("relies on a unique snapshot per scan job so each completed run stays distinct", () => {
    const schemaSource = readFileSync(
      resolve(import.meta.dirname, "../../../db/src/schema/inventory.ts"),
      "utf8",
    );
    expect(schemaSource).toContain('uniqueIndex("scan_snapshot_scan_job_id_idx").on(table.scanJobId)');
  });
});

function createCaller(userId: string) {
  return reportsRouter.createCaller({
    auth: null,
    session: {
      session: {
        id: `${userId}-session`,
        token: `${userId}-token`,
        userId,
        expiresAt: new Date("2026-06-30T12:00:00.000Z"),
        ipAddress: null,
        userAgent: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      user: {
        id: userId,
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        image: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
    },
  });
}

function completedScanRow() {
  return {
    id: "scan-1",
    status: "completed",
    completedAt: baseDate,
  };
}

function facetRows() {
  return [
    {
      category: "certificate",
      sourceType: "github",
      assetClass: "certificate",
      riskLevel: "high",
      nistMapping: sampleNistMapping(),
    },
  ];
}

function findingRows() {
  return [
    {
      category: "certificate",
      code: "certificate_expired",
      title: "Expired certificate",
      riskLevel: "high",
      replacementPriority: "P1",
      sourceType: "github",
      sourceRef: "repo/cert.pem",
      evidence: {
        sourceRef: "repo/cert.pem",
        locator: "s3://evidence/cert",
        capturedAt: baseDate,
        redacted: true,
        redaction: { fields: ["metadata.secret"], rulesApplied: ["strip-metadata"] },
        metadata: { secret: "must-not-leak" },
      },
      nistMapping: sampleNistMapping(),
      assetIdentifier: "cert.example.com",
    },
  ];
}

function sampleNistMapping() {
  return {
    mappingType: "direct" as const,
    references: [{ id: "NIST SP 1800-16", title: "Securing Web Transactions" }],
    summary: "Replace expired certificate.",
  };
}

function selectLimitRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function selectWhereRows(rows: unknown[]) {
  return {
    from: () => ({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function selectOrderByRows(rows: unknown[]) {
  const limitSpy = vi.fn().mockResolvedValue(rows);
  const orderBySpy = vi.fn().mockReturnValue({ limit: limitSpy });

  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          orderBy: orderBySpy,
        }),
      }),
    }),
  };
}

function selectOrderByRowsWithoutLimit(rows: unknown[]) {
  const orderBySpy = vi.fn().mockResolvedValue(rows);

  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          orderBy: orderBySpy,
        }),
      }),
    }),
  };
}

function selectArtifactHistoryRows(rows: unknown[]) {
  const orderBySpy = vi.fn().mockResolvedValue(rows);

  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          orderBy: orderBySpy,
        }),
      }),
    }),
  };
}

function sqlConditionContainsValue(
  value: unknown,
  target: string,
  seen = new WeakSet<object>(),
): boolean {
  if (value === target) return true;
  if (value == null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => sqlConditionContainsValue(item, target, seen));
  }
  return Object.values(value).some((item) => sqlConditionContainsValue(item, target, seen));
}
