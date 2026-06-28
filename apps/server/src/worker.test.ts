import { describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("@cipher-atlas/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

import { processNextScanJob, sanitizeScanFailureMessage } from "./worker";

describe("scan worker", () => {
  it("marks failed processing attempts with redacted terminal state", async () => {
    const persistedUpdates: Record<string, unknown>[] = [];

    transactionMock
      .mockImplementationOnce(async (callback) =>
        callback({
          select: vi
            .fn()
            .mockReturnValueOnce(selectRows([{ id: "scan-1", tenantId: "tenant-1" }]))
            .mockReturnValueOnce(selectRows([])),
          update: vi.fn().mockReturnValue(updateReturning([{ id: "scan-1", tenantId: "tenant-1" }])),
          insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
        }),
      )
      .mockImplementationOnce(async (callback) =>
        callback({
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
