import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, selectMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@cipher-atlas/db", () => ({
  db: {
    delete: vi.fn(),
    insert: insertMock,
    select: selectMock,
  },
}));

import { db } from "@cipher-atlas/db";
import { scansRouter } from "./scans";

const baseDate = new Date("2026-06-29T12:00:00.000Z");

describe("scans router history contract", () => {
  beforeEach(() => {
    insertMock.mockReset();
    selectMock.mockReset();
    vi.mocked(db.delete).mockReset();
  });

  it("returns tenant-scoped history rows newest first with summaries and no coverage slices", async () => {
    const orderBySpy = vi.fn((..._args: unknown[]) => limitOffsetRows([scanJobRow("scan-new"), scanJobRow("scan-old")]));
    const whereSpy = vi.fn(() => ({ orderBy: orderBySpy }));

    selectMock
      .mockReturnValueOnce({ from: () => ({ where: whereSpy }) })
      .mockReturnValueOnce(selectWhereRows([scopeRow("scan-new"), scopeRow("scan-old")]))
      .mockReturnValueOnce(selectWhereRows([attemptRow("scan-new", "attempt-new"), attemptRow("scan-old", "attempt-old")]))
      .mockReturnValueOnce(selectCoverageRows([coverageRow("scan-new", "attempt-new")]));

    const rows = await createCaller("user-1").list();

    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(orderBySpy).toHaveBeenCalledTimes(1);
    expect(orderBySpy.mock.calls[0]).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(["scan-new", "scan-old"]);
    expect(rows[0]).toMatchObject({
      id: "scan-new",
      status: "completed",
      failureMessage: null,
      connectors: [
        expect.objectContaining({
          connectorId: "connector-1",
          displayName: "GitHub snapshot",
          sourceType: "github",
        }),
      ],
      coverageSummary: {
        overall: "full",
        total: 1,
      },
    });
    expect(rows[0]?.coverageSlices).toBeUndefined();
  });

  it("returns detail with coverage slices for an authenticated tenant", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectWhereRows([scopeRow("scan-1")]))
      .mockReturnValueOnce(selectWhereRows([attemptRow("scan-1", "attempt-1")]))
      .mockReturnValueOnce(
        selectCoverageRows([
          coverageRow("scan-1", "attempt-1"),
          coverageRow("scan-2", "attempt-1"),
        ]),
      );

    const scan = await createCaller("user-1").get({ id: "scan-1" });

    expect(scan.id).toBe("scan-1");
    expect(scan.coverageSummary).toMatchObject({ overall: "full", total: 1 });
    expect(scan.coverageSlices).toEqual([
      expect.objectContaining({
        scanJobId: "scan-1",
        scanAttemptId: "attempt-1",
        connectorDisplayName: "GitHub snapshot",
        coverageStatus: "completed",
      }),
    ]);
  });

  it("returns not found for missing or cross-tenant scan ids", async () => {
    const limitSpy = vi.fn().mockResolvedValue([]);
    const whereSpy = vi.fn().mockReturnValue({ limit: limitSpy });

    selectMock.mockReturnValueOnce({
      from: () => ({
        where: whereSpy,
      }),
    });

    await expect(createCaller("user-1").get({ id: "scan-other-tenant" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan not found",
    } satisfies Partial<TRPCError>);

    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(limitSpy).toHaveBeenCalledWith(1);
  });

  it("creates a separate scan job and connector snapshot for every repeated launch", async () => {
    const insertedJobs: unknown[] = [];
    const insertedScopes: unknown[][] = [];

    selectMock
      .mockReturnValueOnce(selectWhereRows([connectorRow()]))
      .mockReturnValueOnce(selectWhereRows([scopeRow("created-scan-1")]))
      .mockReturnValueOnce(selectWhereRows([]))
      .mockReturnValueOnce(selectWhereRows([connectorRow()]))
      .mockReturnValueOnce(selectWhereRows([scopeRow("created-scan-2")]))
      .mockReturnValueOnce(selectWhereRows([]));

    insertMock
      .mockReturnValueOnce(insertReturning((values) => {
        insertedJobs.push(values);
        return scanJobRow((values as { id: string }).id);
      }))
      .mockReturnValueOnce(insertValues((values) => {
        insertedScopes.push(values as unknown[]);
      }))
      .mockReturnValueOnce(insertReturning((values) => {
        insertedJobs.push(values);
        return scanJobRow((values as { id: string }).id);
      }))
      .mockReturnValueOnce(insertValues((values) => {
        insertedScopes.push(values as unknown[]);
      }));

    const first = await createCaller("user-1").create({ connectorIds: ["connector-1"] });
    const second = await createCaller("user-1").create({ connectorIds: ["connector-1"] });

    expect(first.id).not.toBe(second.id);
    expect(insertedJobs).toHaveLength(2);
    expect(insertedScopes).toHaveLength(2);
    expect(insertedJobs[0]).toEqual(expect.objectContaining({ id: first.id }));
    expect(insertedJobs[1]).toEqual(expect.objectContaining({ id: second.id }));
    expect(insertedScopes[0]).toEqual([
      expect.objectContaining({
        scanJobId: first.id,
        connectorId: "connector-1",
        displayName: "GitHub live name",
        sourceType: "github",
        statusAtLaunch: "usable",
      }),
    ]);
    expect(insertedScopes[1]).toEqual([
      expect.objectContaining({
        scanJobId: second.id,
        connectorId: "connector-1",
        displayName: "GitHub live name",
        sourceType: "github",
        statusAtLaunch: "usable",
      }),
    ]);
  });

  it("deletes the scan job when connector snapshot creation fails", async () => {
    const deleteWhereSpy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({
      where: deleteWhereSpy,
    } as never);

    selectMock.mockReturnValueOnce(selectWhereRows([connectorRow()]));

    insertMock
      .mockReturnValueOnce(
        insertReturning((values) => scanJobRow((values as { id: string }).id)),
      )
      .mockReturnValueOnce({
        values: vi.fn().mockRejectedValue(new Error("snapshot insert failed")),
      });

    await expect(createCaller("user-1").create({ connectorIds: ["connector-1"] })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Scan could not be created",
    } satisfies Partial<TRPCError>);

    expect(deleteWhereSpy).toHaveBeenCalledTimes(1);
    expect(deleteWhereSpy).toHaveBeenCalledTimes(1);
  });
});

function createCaller(userId: string) {
  return scansRouter.createCaller({
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
        email: `${userId}@example.com`,
        emailVerified: true,
        name: "Test User",
        image: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
    },
  });
}

function scanJobRow(id: string) {
  return {
    id,
    tenantId: "tenant_user-1",
    createdByUserId: "user-1",
    status: "completed",
    failureMessage: null,
    queuedAt: baseDate,
    startedAt: baseDate,
    completedAt: baseDate,
    failedAt: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };
}

function scopeRow(scanJobId: string) {
  return {
    scanJobId,
    connectorId: "connector-1",
    tenantId: "tenant_user-1",
    sourceType: "github",
    displayName: "GitHub snapshot",
    statusAtLaunch: "usable",
    selectedAt: baseDate,
  };
}

function attemptRow(scanJobId: string, id: string) {
  return {
    id,
    scanJobId,
    tenantId: "tenant_user-1",
    attemptNumber: 1,
    status: "completed",
    workerId: "worker-1",
    claimedAt: baseDate,
    startedAt: baseDate,
    completedAt: baseDate,
    failedAt: null,
    failureMessage: null,
    heartbeatAt: baseDate,
    createdAt: baseDate,
    updatedAt: baseDate,
  };
}

function coverageRow(scanJobId: string, scanAttemptId: string) {
  return {
    id: `${scanJobId}-slice-1`,
    scanJobId,
    scanAttemptId,
    tenantId: "tenant_user-1",
    connectorId: "connector-1",
    connectorDisplayName: "GitHub snapshot",
    sourceType: "github",
    segmentLabel: "Repository metadata",
    coverageStatus: "completed",
    detailMessage: null,
    startedAt: baseDate,
    completedAt: baseDate,
    failedAt: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };
}

function connectorRow() {
  return {
    id: "connector-1",
    tenantId: "tenant_user-1",
    createdByUserId: "user-1",
    sourceType: "github",
    displayName: "GitHub live name",
    status: "usable",
    credentialCiphertext: "ciphertext",
    credentialPreview: "ghp_...",
    lastValidationStatus: "valid",
    lastValidationMessage: null,
    lastValidatedAt: baseDate,
    createdAt: baseDate,
    updatedAt: baseDate,
  };
}

function selectWhereRows(rows: unknown[]) {
  return {
    from: () => ({
      where: vi.fn().mockResolvedValue(rows),
    }),
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

function selectCoverageRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function limitOffsetRows(rows: unknown[]) {
  return {
    limit: () => ({
      offset: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function insertReturning(createRow: (values: unknown) => unknown) {
  return {
    values: (values: unknown) => ({
      returning: vi.fn().mockResolvedValue([createRow(values)]),
    }),
  };
}

function insertValues(recordValues: (values: unknown) => void) {
  return {
    values: vi.fn().mockImplementation((values: unknown) => {
      recordValues(values);
      return Promise.resolve(undefined);
    }),
  };
}
