import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, insertMock, loadCoverageMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  loadCoverageMock: vi.fn(),
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

import { reportsRouter } from "./reports";

const baseDate = new Date("2026-06-29T12:00:00.000Z");

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
