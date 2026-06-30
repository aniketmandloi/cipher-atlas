import type { Finding, FindingCategory, FindingCode, ReplacementPriority, RiskLevel } from "./contracts";

const launchPrioritizationMatrix: Record<
  FindingCode,
  { riskLevel: RiskLevel; replacementPriority: ReplacementPriority }
> = {
  hndl_exposure: { riskLevel: "critical", replacementPriority: "P1" },
  certificate_expired: { riskLevel: "high", replacementPriority: "P1" },
  tls_outdated_protocol: { riskLevel: "high", replacementPriority: "P2" },
  dependency_vulnerable_package: { riskLevel: "high", replacementPriority: "P2" },
  tls_weak_cipher: { riskLevel: "medium", replacementPriority: "P3" },
  certificate_expiring_soon: { riskLevel: "medium", replacementPriority: "P3" },
};

const riskLevelRank: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// P4 is reserved for future actionable findings; the launch matrix only assigns P1–P3 today.
const replacementPriorityRank: Record<ReplacementPriority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
};

export function riskLevelRankValue(level: RiskLevel): number {
  return riskLevelRank[level];
}

export function replacementPriorityRankValue(priority: ReplacementPriority): number {
  return replacementPriorityRank[priority];
}

export function prioritizeFinding(code: FindingCode): {
  riskLevel: RiskLevel;
  replacementPriority: ReplacementPriority | null;
} {
  const mapped = launchPrioritizationMatrix[code];
  if (mapped) {
    return mapped;
  }

  return { riskLevel: "low", replacementPriority: null };
}

export function applyPrioritization<T extends Omit<Finding, "riskLevel" | "replacementPriority" | "nistMapping">>(
  finding: T,
): T & Pick<Finding, "riskLevel" | "replacementPriority"> {
  const { riskLevel, replacementPriority } = prioritizeFinding(finding.code);

  return {
    ...finding,
    riskLevel,
    replacementPriority,
  };
}

export function compareFindingsByPriority(left: Finding, right: Finding): number {
  const riskDelta = riskLevelRank[left.riskLevel] - riskLevelRank[right.riskLevel];
  if (riskDelta !== 0) {
    return riskDelta;
  }

  const leftPriorityRank =
    left.replacementPriority === null ? Number.MAX_SAFE_INTEGER : replacementPriorityRank[left.replacementPriority];
  const rightPriorityRank =
    right.replacementPriority === null ? Number.MAX_SAFE_INTEGER : replacementPriorityRank[right.replacementPriority];
  const priorityDelta = leftPriorityRank - rightPriorityRank;
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const categoryDelta = compareCategory(left.category, right.category);
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  const codeDelta = left.code.localeCompare(right.code);
  if (codeDelta !== 0) {
    return codeDelta;
  }

  const sourceRefDelta = left.sourceRef.localeCompare(right.sourceRef);
  if (sourceRefDelta !== 0) {
    return sourceRefDelta;
  }

  return left.id.localeCompare(right.id);
}

export function sortFindingsByPriority(findings: Finding[]): Finding[] {
  return [...findings].sort(compareFindingsByPriority);
}

function compareCategory(left: FindingCategory, right: FindingCategory): number {
  return left.localeCompare(right);
}
