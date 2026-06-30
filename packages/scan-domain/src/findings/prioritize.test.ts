import { describe, expect, it } from "vitest";

import { findingCodes, replacementPriorities, riskLevels } from "./contracts";
import { applyNistMapping } from "./nist-mapping";
import {
  applyPrioritization,
  compareFindingsByPriority,
  prioritizeFinding,
  replacementPriorityRankValue,
  riskLevelRankValue,
} from "./prioritize";
import type { Finding } from "./contracts";

type PrioritizationDraft = Omit<Finding, "riskLevel" | "replacementPriority" | "nistMapping">;

describe("prioritizeFinding", () => {
  it.each([
    ["hndl_exposure", "critical", "P1"],
    ["certificate_expired", "high", "P1"],
    ["tls_outdated_protocol", "high", "P2"],
    ["dependency_vulnerable_package", "high", "P2"],
    ["tls_weak_cipher", "medium", "P3"],
    ["certificate_expiring_soon", "medium", "P3"],
  ] as const)("maps %s to risk=%s and priority=%s", (code, riskLevel, replacementPriority) => {
    expect(prioritizeFinding(code)).toEqual({ riskLevel, replacementPriority });
  });

  it("covers every launch finding code in the scoring matrix", () => {
    for (const code of findingCodes) {
      const result = prioritizeFinding(code);
      expect(result.riskLevel).toBeTruthy();
      expect(result.replacementPriority).toBeDefined();
      expect(result.replacementPriority).not.toBeNull();
      expect(result.replacementPriority).toMatch(/^P[1-4]$/);
    }
  });

  it("keeps storage enum declaration order aligned with domain sort ranks", () => {
    for (let index = 1; index < riskLevels.length; index += 1) {
      const previous = riskLevels[index - 1]!;
      const current = riskLevels[index]!;
      expect(riskLevelRankValue(current)).toBeGreaterThan(riskLevelRankValue(previous));
    }

    for (let index = 1; index < replacementPriorities.length; index += 1) {
      const previous = replacementPriorities[index - 1]!;
      const current = replacementPriorities[index]!;
      expect(replacementPriorityRankValue(current)).toBeGreaterThan(replacementPriorityRankValue(previous));
    }
  });
});

describe("compareFindingsByPriority", () => {
  it("orders by risk, then priority, then category/code/source/id", () => {
    const findings: Finding[] = [
      findingFixture({ id: "finding_b", code: "tls_weak_cipher", category: "tls" }),
      findingFixture({ id: "finding_a", code: "hndl_exposure", category: "hndl" }),
      findingFixture({ id: "finding_c", code: "certificate_expired", category: "certificate" }),
    ].map((item) => applyNistMapping(applyPrioritization(item)));

    const sorted = [...findings].sort(compareFindingsByPriority);

    expect(sorted.map((item) => item.code)).toEqual([
      "hndl_exposure",
      "certificate_expired",
      "tls_weak_cipher",
    ]);
  });
});

describe("applyPrioritization", () => {
  it("does not change stable finding ids", () => {
    const base = findingFixture({
      id: "finding_stable1234567890123456789012",
      code: "certificate_expired",
      category: "certificate",
    });
    const prioritized = applyPrioritization(base);

    expect(prioritized.id).toBe(base.id);
    expect(prioritized.id).not.toContain("critical");
    expect(prioritized.id).not.toContain("P1");
  });
});

function findingFixture(
  overrides: Partial<PrioritizationDraft> & Pick<Finding, "id" | "code" | "category">,
): PrioritizationDraft {
  return {
    snapshotId: "snapshot-1",
    scanJobId: "scan-1",
    scanAttemptId: "attempt-1",
    tenantId: "tenant-1",
    assetId: "asset-1",
    assetClass: "certificate",
    title: "Test finding",
    rationale: "Test rationale",
    sourceType: "github",
    sourceRef: "repo/example",
    evidence: {
      sourceRef: "repo/example",
      locator: "s3://evidence",
      capturedAt: new Date("2026-06-29T12:00:00.000Z"),
      redacted: false,
      redaction: { fields: [], rulesApplied: [] },
      metadata: {},
    },
    detectedAt: new Date("2026-06-29T12:00:00.000Z"),
    ...overrides,
  };
}
