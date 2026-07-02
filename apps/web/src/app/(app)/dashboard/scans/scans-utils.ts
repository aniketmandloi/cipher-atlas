import { toneBadgeProps, type ToneBadgeProps } from "@/lib/status-styles";

export type ScanStatus = "queued" | "running" | "completed" | "failed";
export type ConnectorStatus = "pending_validation" | "usable" | "invalid" | "unsupported";
export type CoverageOverall = "full" | "partial" | "failed" | "empty";

export function scanStatusBadgeProps(status: ScanStatus): ToneBadgeProps {
  switch (status) {
    case "queued":
      return toneBadgeProps("neutral");
    case "running":
      return toneBadgeProps("info");
    case "completed":
      return toneBadgeProps("positive");
    case "failed":
      return toneBadgeProps("negative");
  }
}

export function scanStatusLabel(status: ScanStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

export function coverageBadgeProps(overall: CoverageOverall): ToneBadgeProps {
  switch (overall) {
    case "full":
      return toneBadgeProps("positive");
    case "partial":
      return toneBadgeProps("warning");
    case "failed":
      return toneBadgeProps("negative");
    case "empty":
      return toneBadgeProps("neutral");
  }
}

export function coverageLabel(overall: CoverageOverall): string {
  switch (overall) {
    case "full":
      return "Full coverage";
    case "partial":
      return "Partial coverage";
    case "failed":
      return "Coverage failed";
    case "empty":
      return "No data";
  }
}

export function connectorBlockedMessage(
  status: ConnectorStatus,
  lastValidationMessage: string | null,
): string {
  switch (status) {
    case "pending_validation":
      return "Pending validation — validate this connector before launching a scan.";
    case "invalid":
      return lastValidationMessage
        ? `Invalid — ${lastValidationMessage}`
        : "Invalid — revalidate or recreate before launching a scan.";
    case "unsupported":
      return "Unsupported source type for scanning.";
    default:
      return "Not eligible for scan launch.";
  }
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
