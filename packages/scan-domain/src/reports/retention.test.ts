import { describe, expect, it } from "vitest";

import {
  RETENTION_WINDOW_DAYS,
  computeRetainedUntil,
  isWithinRetention,
} from "./retention";

describe("retention", () => {
  const publishedAt = new Date("2026-01-15T12:00:00.000Z");

  it("uses a 365-day retention window", () => {
    expect(RETENTION_WINDOW_DAYS).toBe(365);
  });

  it("computeRetainedUntil adds exactly 365 days in milliseconds", () => {
    const retainedUntil = computeRetainedUntil(publishedAt);
    const expectedMs = publishedAt.getTime() + RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(retainedUntil.getTime()).toBe(expectedMs);
  });

  it("isWithinRetention is true at publishedAt", () => {
    expect(isWithinRetention(publishedAt, publishedAt)).toBe(true);
  });

  it("isWithinRetention is true at exactly retainedUntil (inclusive boundary)", () => {
    const retainedUntil = computeRetainedUntil(publishedAt);
    expect(isWithinRetention(publishedAt, retainedUntil)).toBe(true);
  });

  it("isWithinRetention is false at retainedUntil + 1ms", () => {
    const retainedUntil = computeRetainedUntil(publishedAt);
    expect(isWithinRetention(publishedAt, new Date(retainedUntil.getTime() + 1))).toBe(false);
  });

  it("is deterministic for fixed inputs without ambient clock reads", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(isWithinRetention(publishedAt, now)).toBe(isWithinRetention(publishedAt, now));
    expect(computeRetainedUntil(publishedAt).getTime()).toBe(
      computeRetainedUntil(publishedAt).getTime(),
    );
  });
});
