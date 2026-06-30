import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock("@cipher-atlas/db", () => ({
  db: {
    select: selectMock,
  },
}));

import { findingsRouter } from "./findings";

const baseDate = new Date("2026-06-29T12:00:00.000Z");

describe("findings router browse contract", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns not found for missing or cross-tenant scan ids", async () => {
    const limitSpy = vi.fn().mockResolvedValue([]);
    const whereSpy = vi.fn().mockReturnValue({ limit: limitSpy });

    selectMock.mockReturnValueOnce({
      from: () => ({
        where: whereSpy,
      }),
    });

    await expect(createCaller("user-1").list({ scanId: "scan-other-tenant" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan not found",
    } satisfies Partial<TRPCError>);

    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(limitSpy).toHaveBeenCalledWith(1);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns completed scan browse data with all category facet counts and hydrated rows", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectWhereRows(facetRows()))
      .mockReturnValueOnce(selectWhereRows([{ total: 2 }]))
      .mockReturnValueOnce(selectListRows(listRows()));

    const result = await createCaller("user-1").list({ scanId: "scan-1" });

    expect(result.scan).toMatchObject({
      id: "scan-1",
      status: "completed",
    });
    expect(result.snapshot).toMatchObject({
      id: "snapshot-1",
      assetCount: 4,
    });
    expect(result.facetCounts.categoryCounts).toEqual({
      certificate: 1,
      tls: 1,
      dependency: 0,
      hndl: 0,
    });
    expect(result.facetCounts.sourceCounts).toEqual([{ sourceType: "github", count: 2 }]);
    expect(result.facetCounts.assetClassCounts).toEqual([
      { assetClass: "certificate", count: 1 },
      { assetClass: "tls_config", count: 1 },
    ]);
    expect(result.page).toMatchObject({
      limit: 50,
      offset: 0,
      returned: 2,
      filteredTotal: 2,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "finding-cert",
        snapshotId: "snapshot-1",
        assetId: "asset-cert",
        assetClass: "certificate",
        category: "certificate",
        code: "certificate_expired",
        sourceType: "github",
        sourceRef: "repo/cert.pem",
        title: "Expired certificate",
        rationale: "Certificate expired yesterday.",
        evidence: expect.objectContaining({
          locator: "s3://evidence/cert",
          redacted: true,
        }),
      }),
      expect.objectContaining({
        id: "finding-tls",
        snapshotId: "snapshot-1",
        assetId: "asset-tls",
        assetClass: "tls_config",
        category: "tls",
        code: "tls_weak_cipher",
        sourceType: "github",
        sourceRef: "repo/tls.json",
        title: "Weak TLS cipher",
        rationale: "TLS endpoint negotiates a weak cipher suite.",
        evidence: expect.objectContaining({
          locator: "s3://evidence/tls",
        }),
      }),
    ]);
    expect(result.items[0]?.evidence).not.toHaveProperty("metadata");
  });

  it("applies filters while keeping facet counts based on the full snapshot", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectWhereRows(facetRows()))
      .mockReturnValueOnce(selectWhereRows([{ total: 1 }]))
      .mockReturnValueOnce(selectListRows([listRows()[0]!]));

    const result = await createCaller("user-1").list({
      scanId: "scan-1",
      category: "certificate",
      sourceType: "github",
      assetClass: "certificate",
      limit: 10,
      offset: 0,
    });

    expect(result.filters).toEqual({
      category: "certificate",
      sourceType: "github",
      assetClass: "certificate",
    });
    expect(result.facetCounts.categoryCounts).toEqual({
      certificate: 1,
      tls: 1,
      dependency: 0,
      hndl: 0,
    });
    expect(result.page.filteredTotal).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.category).toBe("certificate");
  });

  it("returns empty rows and zero facet counts for completed scans without findings", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectWhereRows([]))
      .mockReturnValueOnce(selectWhereRows([{ total: 0 }]))
      .mockReturnValueOnce(selectListRows([]));

    const result = await createCaller("user-1").list({ scanId: "scan-1" });

    expect(result.facetCounts.categoryCounts).toEqual({
      certificate: 0,
      tls: 0,
      dependency: 0,
      hndl: 0,
    });
    expect(result.items).toEqual([]);
    expect(result.page).toMatchObject({
      returned: 0,
      filteredTotal: 0,
    });
  });

  it("returns empty browse data when a completed scan has no snapshot", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([]));

    const result = await createCaller("user-1").list({ scanId: "scan-1" });

    expect(result.snapshot).toBeNull();
    expect(result.facetCounts.categoryCounts).toEqual({
      certificate: 0,
      tls: 0,
      dependency: 0,
      hndl: 0,
    });
    expect(result.items).toEqual([]);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("findings router get contract", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns not found for cross-tenant or missing scan without leaking evidence", async () => {
    const limitSpy = vi.fn().mockResolvedValue([]);
    const whereSpy = vi.fn().mockReturnValue({ limit: limitSpy });

    selectMock.mockReturnValueOnce({
      from: () => ({
        where: whereSpy,
      }),
    });

    await expect(
      createCaller("user-1").get({ scanId: "scan-other-tenant", findingId: "finding-cert" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Scan not found",
    } satisfies Partial<TRPCError>);

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(limitSpy).toHaveBeenCalledWith(1);
  });

  it("returns bad request when scan is not completed", async () => {
    selectMock.mockReturnValueOnce(
      selectLimitRows([
        {
          id: "scan-1",
          status: "running",
          completedAt: null,
        },
      ]),
    );

    await expect(
      createCaller("user-1").get({ scanId: "scan-1", findingId: "finding-cert" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Findings are available only after a scan completes.",
    } satisfies Partial<TRPCError>);

    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns not found when finding is not in the completed scan snapshot", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectGetFindingRows([]));

    await expect(
      createCaller("user-1").get({ scanId: "scan-1", findingId: "finding-missing" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Finding not found",
    } satisfies Partial<TRPCError>);

    expect(selectMock).toHaveBeenCalledTimes(3);
  });

  it("returns hydrated finding detail with projected evidence for a completed scan", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectGetFindingRows([listRows()[0]!]));

    const result = await createCaller("user-1").get({
      scanId: "scan-1",
      findingId: "finding-cert",
    });

    expect(result.scan).toMatchObject({
      id: "scan-1",
      status: "completed",
    });
    expect(result.snapshot).toMatchObject({
      id: "snapshot-1",
    });
    expect(result.finding).toEqual(
      expect.objectContaining({
        id: "finding-cert",
        snapshotId: "snapshot-1",
        assetIdentifier: "CN=example.com",
        connectorDisplayName: "GitHub snapshot",
        sourceRef: "repo/cert.pem",
        rationale: "Certificate expired yesterday.",
        evidence: expect.objectContaining({
          locator: "s3://evidence/cert",
          redacted: true,
          redaction: expect.objectContaining({
            fields: ["privateKey"],
          }),
        }),
      }),
    );
    expect(result.finding.evidence).not.toHaveProperty("metadata");
  });

  it("returns the same payload shape for two authorized users in the same tenant", async () => {
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectGetFindingRows([listRows()[0]!]));

    const userOneResult = await createCaller("user-1").get({
      scanId: "scan-1",
      findingId: "finding-cert",
    });

    selectMock.mockReset();
    selectMock
      .mockReturnValueOnce(selectLimitRows([scanJobRow("scan-1")]))
      .mockReturnValueOnce(selectLimitRows([snapshotRow("scan-1", "snapshot-1")]))
      .mockReturnValueOnce(selectGetFindingRows([listRows()[0]!]));

    const userTwoResult = await createCaller("user-2").get({
      scanId: "scan-1",
      findingId: "finding-cert",
    });

    expect(userOneResult).toEqual(userTwoResult);
  });
});

function createCaller(userId: string) {
  return findingsRouter.createCaller({
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
    status: "completed",
    completedAt: baseDate,
  };
}

function snapshotRow(scanJobId: string, id: string) {
  return {
    id,
    scanJobId,
    publishedAt: baseDate,
    assetCount: 4,
  };
}

function facetRows() {
  return [
    { category: "certificate", sourceType: "github", assetClass: "certificate" },
    { category: "tls", sourceType: "github", assetClass: "tls_config" },
  ];
}

function listRows() {
  return [
    {
      id: "finding-cert",
      snapshotId: "snapshot-1",
      assetId: "asset-cert",
      assetClass: "certificate",
      category: "certificate",
      code: "certificate_expired",
      title: "Expired certificate",
      rationale: "Certificate expired yesterday.",
      sourceType: "github",
      sourceRef: "repo/cert.pem",
      evidence: {
        sourceRef: "repo/cert.pem",
        locator: "s3://evidence/cert",
        capturedAt: baseDate,
        redacted: true,
        redaction: { fields: ["privateKey"], rulesApplied: ["strip-private-key"] },
        metadata: { secret: "should-not-leak" },
      },
      detectedAt: baseDate,
      assetIdentifier: "CN=example.com",
      connectorDisplayName: "GitHub snapshot",
    },
    {
      id: "finding-tls",
      snapshotId: "snapshot-1",
      assetId: "asset-tls",
      assetClass: "tls_config",
      category: "tls",
      code: "tls_weak_cipher",
      title: "Weak TLS cipher",
      rationale: "TLS endpoint negotiates a weak cipher suite.",
      sourceType: "github",
      sourceRef: "repo/tls.json",
      evidence: {
        sourceRef: "repo/tls.json",
        locator: "s3://evidence/tls",
        capturedAt: baseDate,
        redacted: false,
        redaction: { fields: [], rulesApplied: [] },
        metadata: {},
      },
      detectedAt: baseDate,
      assetIdentifier: "api.example.com:443",
      connectorDisplayName: "GitHub snapshot",
    },
  ];
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

function selectListRows(rows: unknown[]) {
  const offsetSpy = vi.fn().mockResolvedValue(rows);
  const limitSpy = vi.fn().mockReturnValue({ offset: offsetSpy });
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

function selectGetFindingRows(rows: unknown[]) {
  const limitSpy = vi.fn().mockResolvedValue(rows);

  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: limitSpy,
        }),
      }),
    }),
  };
}
