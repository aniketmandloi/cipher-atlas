import { describe, expect, it } from "vitest";

import {
  canTransitionScanStatus,
  connectorScanEligibility,
  redactScanJob,
  scanStatusSchema,
  transitionScanStatus,
  type ScanJobRecord,
} from "./index";

const now = new Date("2026-06-28T12:00:00.000Z");

describe("scan orchestration", () => {
  it("defines the persisted lifecycle states", () => {
    expect(scanStatusSchema.options).toEqual(["queued", "running", "completed", "failed"]);
  });

  it("allows only supported lifecycle transitions", () => {
    expect(canTransitionScanStatus("queued", "running")).toBe(true);
    expect(canTransitionScanStatus("running", "completed")).toBe(true);
    expect(canTransitionScanStatus("running", "failed")).toBe(true);
    expect(canTransitionScanStatus("queued", "failed")).toBe(true);

    expect(canTransitionScanStatus("completed", "running")).toBe(false);
    expect(canTransitionScanStatus("failed", "completed")).toBe(false);
  });

  it("updates lifecycle timestamps when transitioning status", () => {
    const running = transitionScanStatus(
      {
        status: "queued",
        queuedAt: now,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        failureMessage: null,
      },
      "running",
      new Date("2026-06-28T12:01:00.000Z"),
    );

    expect(running).toMatchObject({
      status: "running",
      startedAt: new Date("2026-06-28T12:01:00.000Z"),
      completedAt: null,
      failedAt: null,
      failureMessage: null,
    });

    const completed = transitionScanStatus(
      running,
      "completed",
      new Date("2026-06-28T12:02:00.000Z"),
    );

    expect(completed).toMatchObject({
      status: "completed",
      completedAt: new Date("2026-06-28T12:02:00.000Z"),
      failedAt: null,
    });
  });

  it("rejects invalid status transitions", () => {
    expect(() =>
      transitionScanStatus(
        {
          status: "completed",
          queuedAt: now,
          startedAt: now,
          completedAt: now,
          failedAt: null,
          failureMessage: null,
        },
        "running",
        now,
      ),
    ).toThrow("Cannot transition scan from completed to running");
  });

  it("accepts only usable GitHub and AWS connectors for scan launch", () => {
    expect(
      connectorScanEligibility({
        id: "github-1",
        sourceType: "github",
        displayName: "GitHub",
        status: "usable",
        lastValidationMessage: "Ready",
      }),
    ).toEqual({ eligible: true });

    expect(
      connectorScanEligibility({
        id: "github-2",
        sourceType: "github",
        displayName: "Pending GitHub",
        status: "pending_validation",
        lastValidationMessage: "Validate first",
      }),
    ).toEqual({
      eligible: false,
      reason: "Pending GitHub is pending validation. Validate it before launching a scan.",
    });

    expect(
      connectorScanEligibility({
        id: "aws-1",
        sourceType: "aws",
        displayName: "Invalid AWS",
        status: "invalid",
        lastValidationMessage: "Bad key",
      }),
    ).toEqual({
      eligible: false,
      reason: "Invalid AWS is invalid: Bad key",
    });
  });

  it("rejects unsupported source types with an operator-facing reason", () => {
    expect(
      connectorScanEligibility({
        id: "gitlab-1",
        sourceType: "gitlab",
        displayName: "GitLab",
        status: "usable",
        lastValidationMessage: null,
      }),
    ).toEqual({
      eligible: false,
      reason: "GitLab uses unsupported source type gitlab. Scans currently support GitHub and AWS connectors.",
    });
  });

  it("redacts scan DTOs while preserving selected connector snapshot metadata", () => {
    const scan: ScanJobRecord = {
      id: "scan-1",
      tenantId: "tenant-1",
      createdByUserId: "user-1",
      status: "completed",
      failureMessage: null,
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      failedAt: null,
      createdAt: now,
      updatedAt: now,
      connectors: [
        {
          connectorId: "connector-1",
          tenantId: "tenant-1",
          sourceType: "github",
          displayName: "GitHub Main",
          statusAtLaunch: "usable",
          selectedAt: now,
        },
      ],
    };

    expect(redactScanJob(scan)).toEqual({
      id: "scan-1",
      tenantId: "tenant-1",
      createdByUserId: "user-1",
      status: "completed",
      failureMessage: null,
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      failedAt: null,
      createdAt: now,
      updatedAt: now,
      connectors: [
        {
          connectorId: "connector-1",
          tenantId: "tenant-1",
          sourceType: "github",
          displayName: "GitHub Main",
          statusAtLaunch: "usable",
          selectedAt: now,
        },
      ],
    });
  });
});
