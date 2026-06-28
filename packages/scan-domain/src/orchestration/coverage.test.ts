import { describe, expect, it } from "vitest";

import {
  coverageStatusSchema,
  deriveScanTerminalStatus,
  redactCoverageSlice,
  summarizeCoverage,
  type CoverageSliceRecord,
} from "./coverage";

const now = new Date("2026-06-28T12:00:00.000Z");

function makeSlice(
  id: string,
  coverageStatus: CoverageSliceRecord["coverageStatus"],
  overrides: Partial<CoverageSliceRecord> = {},
): CoverageSliceRecord {
  return {
    id,
    scanJobId: "job-1",
    scanAttemptId: "attempt-1",
    tenantId: "tenant-1",
    connectorId: `connector-${id}`,
    connectorDisplayName: `Connector ${id}`,
    sourceType: "github",
    segmentLabel: null,
    coverageStatus,
    detailMessage: null,
    startedAt: now,
    completedAt: coverageStatus === "completed" ? now : null,
    failedAt: coverageStatus === "failed" ? now : null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("coverageStatusSchema", () => {
  it("defines the per-slice coverage states", () => {
    expect(coverageStatusSchema.options).toEqual([
      "completed",
      "partial",
      "failed",
      "skipped",
      "unsupported",
    ]);
  });
});

describe("summarizeCoverage", () => {
  it("returns empty for no slices", () => {
    const result = summarizeCoverage([]);
    expect(result.overall).toBe("empty");
    expect(result.total).toBe(0);
  });

  it("returns full when all slices are completed", () => {
    const slices = [makeSlice("a", "completed"), makeSlice("b", "completed")];
    const result = summarizeCoverage(slices);
    expect(result.overall).toBe("full");
    expect(result.counts.completed).toBe(2);
    expect(result.total).toBe(2);
  });

  it("returns partial when at least one completed and others are not", () => {
    const slices = [makeSlice("a", "completed"), makeSlice("b", "failed")];
    const result = summarizeCoverage(slices);
    expect(result.overall).toBe("partial");
    expect(result.counts.completed).toBe(1);
    expect(result.counts.failed).toBe(1);
  });

  it("returns partial when completed mixes with skipped and unsupported", () => {
    const slices = [
      makeSlice("a", "completed"),
      makeSlice("b", "skipped"),
      makeSlice("c", "unsupported"),
    ];
    expect(summarizeCoverage(slices).overall).toBe("partial");
  });

  it("returns failed when no slice is completed", () => {
    const slices = [makeSlice("a", "failed"), makeSlice("b", "skipped")];
    const result = summarizeCoverage(slices);
    expect(result.overall).toBe("failed");
  });

  it("returns failed when all slices are unsupported", () => {
    const slices = [makeSlice("a", "unsupported"), makeSlice("b", "unsupported")];
    expect(summarizeCoverage(slices).overall).toBe("failed");
  });

  it("is deterministic: same input always yields same summary", () => {
    const slices = [makeSlice("a", "completed"), makeSlice("b", "failed")];
    const r1 = summarizeCoverage(slices);
    const r2 = summarizeCoverage(slices);
    expect(r1).toEqual(r2);
  });
});

describe("deriveScanTerminalStatus", () => {
  it("maps full coverage to completed", () => {
    const slices = [makeSlice("a", "completed")];
    expect(deriveScanTerminalStatus(slices)).toBe("completed");
  });

  it("maps partial coverage to completed", () => {
    const slices = [makeSlice("a", "completed"), makeSlice("b", "failed")];
    expect(deriveScanTerminalStatus(slices)).toBe("completed");
  });

  it("maps all-failed to failed", () => {
    const slices = [makeSlice("a", "failed"), makeSlice("b", "failed")];
    expect(deriveScanTerminalStatus(slices)).toBe("failed");
  });

  it("maps empty slices to failed (guard)", () => {
    expect(deriveScanTerminalStatus([])).toBe("failed");
  });
});

describe("redactCoverageSlice", () => {
  it("strips createdAt and updatedAt, preserving all other fields", () => {
    const slice = makeSlice("x", "failed", {
      detailMessage: "Access denied",
      connectorId: null,
    });
    const redacted = redactCoverageSlice(slice);

    expect(redacted).toEqual({
      id: "x",
      scanJobId: "job-1",
      scanAttemptId: "attempt-1",
      tenantId: "tenant-1",
      connectorId: null,
      connectorDisplayName: "Connector x",
      sourceType: "github",
      segmentLabel: null,
      coverageStatus: "failed",
      detailMessage: "Access denied",
      startedAt: now,
      completedAt: null,
      failedAt: now,
    });

    expect(redacted).not.toHaveProperty("createdAt");
    expect(redacted).not.toHaveProperty("updatedAt");
  });

  it("does not re-redact: detailMessage passes through as-is", () => {
    const slice = makeSlice("y", "failed", { detailMessage: "token=[redacted]" });
    expect(redactCoverageSlice(slice).detailMessage).toBe("token=[redacted]");
  });
});
