import { z } from "zod";

import { connectorStatusSchema, connectorSourceTypeSchema } from "../connectors/types";
import type { ConnectorStatus, ConnectorSourceType } from "../connectors/types";

export const scanStatuses = ["queued", "running", "completed", "failed"] as const;
export const scanStatusSchema = z.enum(scanStatuses);

export type ScanStatus = (typeof scanStatuses)[number];

export const createScanInputSchema = z.object({
  connectorIds: z.array(z.string().min(1)).min(1, "Select at least one connector to scan."),
});

export const getScanInputSchema = z.object({
  id: z.string().min(1),
});

export interface ScanLifecycleFields {
  status: ScanStatus;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureMessage: string | null;
}

export interface ScanConnectorScopeRecord {
  connectorId: string;
  tenantId: string;
  sourceType: ConnectorSourceType;
  displayName: string;
  statusAtLaunch: ConnectorStatus;
  selectedAt: Date;
}

export interface ScanJobRecord extends ScanLifecycleFields {
  id: string;
  tenantId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  connectors: ScanConnectorScopeRecord[];
}

export interface RedactedScanJob extends ScanJobRecord {}

export interface ConnectorEligibilityInput {
  id: string;
  sourceType: string;
  displayName: string;
  status: string;
  lastValidationMessage: string | null;
}

export type ConnectorScanEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

const allowedTransitions: Record<ScanStatus, ScanStatus[]> = {
  queued: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransitionScanStatus(from: ScanStatus, to: ScanStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionScanStatus<T extends ScanLifecycleFields>(
  scan: T,
  nextStatus: ScanStatus,
  at: Date,
  failureMessage?: string,
): T {
  if (!canTransitionScanStatus(scan.status, nextStatus)) {
    throw new Error(`Cannot transition scan from ${scan.status} to ${nextStatus}`);
  }

  if (nextStatus === "running") {
    return {
      ...scan,
      status: nextStatus,
      startedAt: at,
      completedAt: null,
      failedAt: null,
      failureMessage: null,
    };
  }

  if (nextStatus === "completed") {
    return {
      ...scan,
      status: nextStatus,
      completedAt: at,
      failedAt: null,
      failureMessage: null,
    };
  }

  return {
    ...scan,
    status: nextStatus,
    failedAt: at,
    failureMessage: failureMessage ?? "Scan failed. Review worker logs for details.",
  };
}

export function connectorScanEligibility(
  connector: ConnectorEligibilityInput,
): ConnectorScanEligibility {
  const sourceType = connectorSourceTypeSchema.safeParse(connector.sourceType);
  if (!sourceType.success) {
    return {
      eligible: false,
      reason: `${connector.displayName} uses unsupported source type ${connector.sourceType}. Scans currently support GitHub and AWS connectors.`,
    };
  }

  const status = connectorStatusSchema.safeParse(connector.status);
  if (!status.success) {
    return {
      eligible: false,
      reason: `${connector.displayName} has unsupported connector status ${connector.status}. Validate it before launching a scan.`,
    };
  }

  if (status.data === "usable") {
    return { eligible: true };
  }

  if (status.data === "pending_validation") {
    return {
      eligible: false,
      reason: `${connector.displayName} is pending validation. Validate it before launching a scan.`,
    };
  }

  if (status.data === "unsupported") {
    return {
      eligible: false,
      reason: `${connector.displayName} is unsupported. Scans currently support GitHub and AWS connectors.`,
    };
  }

  return {
    eligible: false,
    reason: `${connector.displayName} is invalid. Revalidate or recreate it before launching a scan.`,
  };
}

export function redactScanJob(scan: ScanJobRecord): RedactedScanJob {
  return {
    id: scan.id,
    tenantId: scan.tenantId,
    createdByUserId: scan.createdByUserId,
    status: scan.status,
    failureMessage: scan.failureMessage,
    queuedAt: scan.queuedAt,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    failedAt: scan.failedAt,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
    connectors: scan.connectors.map((connector) => ({
      connectorId: connector.connectorId,
      tenantId: connector.tenantId,
      sourceType: connector.sourceType,
      displayName: connector.displayName,
      statusAtLaunch: connector.statusAtLaunch,
      selectedAt: connector.selectedAt,
    })),
  };
}
