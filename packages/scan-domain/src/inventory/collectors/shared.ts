import type { AssetClass, Observation } from "../../shared";
import type { ObservationCollectionScope } from "../collect";

export function baseObservation(
  scope: ObservationCollectionScope,
  assetClass: AssetClass,
  locator: string,
  evidence: Record<string, unknown>,
): Observation {
  return {
    tenantId: scope.tenantId,
    snapshotId: scope.snapshotId,
    scanJobId: scope.scanJobId,
    scanAttemptId: scope.scanAttemptId,
    connectorId: scope.connectorId,
    connectorDisplayName: scope.connectorDisplayName,
    sourceType: scope.sourceType,
    sourceRef: `${scope.sourceType}:${scope.connectorId}`,
    assetClass,
    locator,
    capturedAt: scope.capturedAt,
    evidence,
  };
}

export function combineSignals(
  outer: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return outer ? AbortSignal.any([outer, timeout]) : timeout;
}
