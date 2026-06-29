import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, transactionMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@cipher-atlas/db", () => ({
  db: {
    select: selectMock,
    transaction: transactionMock,
  },
}));

vi.mock("@cipher-atlas/env/server", () => ({
  env: {
    CONNECTOR_CREDENTIAL_ENCRYPTION_KEY: "test-encryption-key",
  },
}));

import { encryptConnectorCredentials } from "@cipher-atlas/scan-domain";

import { processNextScanJob, sanitizeScanFailureMessage } from "./worker";

describe("scan worker", () => {
  beforeEach(() => {
    selectMock.mockReset();
    transactionMock.mockReset();
  });

  it("publishes one inventory snapshot with normalized assets for completed scans", async () => {
    const insertedValues: unknown[] = [];

    selectMock
      .mockReturnValueOnce(
        selectWhereRows([
          {
            scanJobId: "scan-1",
            connectorId: "connector-1",
            tenantId: "tenant-1",
            sourceType: "github",
            displayName: "GitHub",
            statusAtLaunch: "usable",
            selectedAt: new Date("2026-06-28T12:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        selectWhereRows([
          {
            id: "connector-1",
            tenantId: "tenant-1",
            credentialCiphertext: encryptConnectorCredentials(
              { token: "ghp_1234567890abcdefghijklmnop" },
              "test-encryption-key",
            ),
          },
        ]),
      );

    transactionMock
      .mockImplementationOnce(async (callback) =>
        callback({
          select: vi
            .fn()
            .mockReturnValueOnce(selectRowsForUpdate([{ id: "scan-1", tenantId: "tenant-1" }]))
            .mockReturnValueOnce(selectRows([])),
          update: vi.fn().mockReturnValue(updateReturning([{ id: "scan-1", tenantId: "tenant-1" }])),
          insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
        }),
      )
      .mockImplementationOnce(async (callback) =>
        callback({
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((values: unknown) => {
              insertedValues.push(values);
              return Promise.resolve(undefined);
            }),
          }),
          update: vi.fn().mockReturnValue(updateRecording([])),
        }),
      );

    const result = await processNextScanJob({
      workerId: "worker-1",
      maxClaimAttempts: 1,
      now: new Date("2026-06-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      scanJobId: "scan-1",
      status: "completed",
    });
    expect(insertedValues[0]).toMatchObject({
      scanJobId: "scan-1",
      scanAttemptId: expect.any(String),
      tenantId: "tenant-1",
      assetCount: 2,
    });
    expect(insertedValues[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scanJobId: "scan-1",
          tenantId: "tenant-1",
          connectorId: "connector-1",
          connectorDisplayName: "GitHub",
          sourceType: "github",
          assetClass: "dependency",
        }),
        expect.objectContaining({
          scanJobId: "scan-1",
          tenantId: "tenant-1",
          connectorId: "connector-1",
          connectorDisplayName: "GitHub",
          sourceType: "github",
          assetClass: "hndl_signal",
        }),
      ]),
    );
    expect(JSON.stringify(insertedValues[1])).not.toContain("ghp_1234567890abcdefghijklmnop");
  });

  it("marks failed processing attempts with redacted terminal state", async () => {
    const persistedUpdates: Record<string, unknown>[] = [];
    const insertedValues: unknown[] = [];

    selectMock.mockReturnValueOnce(
      selectWhereRows([
        {
          scanJobId: "scan-1",
          connectorId: "connector-1",
          tenantId: "tenant-1",
          sourceType: "github",
          displayName: "GitHub",
          statusAtLaunch: "usable",
          selectedAt: new Date("2026-06-28T12:00:00.000Z"),
        },
      ]),
    );

    transactionMock
      .mockImplementationOnce(async (callback) =>
        callback({
          select: vi
            .fn()
            .mockReturnValueOnce(selectRowsForUpdate([{ id: "scan-1", tenantId: "tenant-1" }]))
            .mockReturnValueOnce(selectRows([])),
          update: vi.fn().mockReturnValue(updateReturning([{ id: "scan-1", tenantId: "tenant-1" }])),
          insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
        }),
      )
      .mockImplementationOnce(async (callback) =>
        callback({
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((values: unknown) => {
              insertedValues.push(values);
              return Promise.resolve(undefined);
            }),
          }),
          update: vi.fn().mockReturnValue(updateRecording(persistedUpdates)),
        }),
      );

    const result = await processNextScanJob({
      workerId: "worker-1",
      failWithMessage: "provider token=ghp_1234567890abcdefghijklmnop failed",
      maxClaimAttempts: 1,
    });

    expect(result).toMatchObject({
      scanJobId: "scan-1",
      status: "failed",
    });
    expect(persistedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          failureMessage: "provider token=[redacted] failed",
        }),
      ]),
    );
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toEqual([
      expect.objectContaining({
        coverageStatus: "failed",
      }),
    ]);
  });

  it("redacts common provider secrets from persisted failure messages", () => {
    const message = sanitizeScanFailureMessage(
      new Error(
        "GitHub request failed token=ghp_1234567890abcdefghijklmnop AWS AKIA1234567890ABCDEF secret:shhh",
      ),
    );

    expect(message).toContain("token=[redacted]");
    expect(message).toContain("[redacted-access-key]");
    expect(message).toContain("secret:[redacted]");
    expect(message).not.toContain("ghp_1234567890abcdefghijklmnop");
    expect(message).not.toContain("AKIA1234567890ABCDEF");
    expect(message).not.toContain("shhh");
  });

  it("normalizes blank worker failures to an operator-safe fallback", () => {
    expect(sanitizeScanFailureMessage("   ")).toBe("Scan failed.");
  });

  it("caps persisted failure messages at the scan schema boundary", () => {
    expect(sanitizeScanFailureMessage("x".repeat(600))).toHaveLength(500);
  });
});

function selectRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

function selectRowsForUpdate(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            for: vi.fn().mockResolvedValue(rows),
          }),
        }),
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

function updateReturning(rows: unknown[]) {
  return {
    set: () => ({
      where: () => ({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function updateRecording(updates: Record<string, unknown>[]) {
  return {
    set: (values: Record<string, unknown>) => ({
      where: vi.fn().mockImplementation(() => {
        updates.push(values);
        return Promise.resolve(undefined);
      }),
    }),
  };
}
