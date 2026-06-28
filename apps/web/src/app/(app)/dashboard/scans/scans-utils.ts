export type ScanStatus = "queued" | "running" | "completed" | "failed";
export type ConnectorStatus = "pending_validation" | "usable" | "invalid" | "unsupported";
export type CoverageOverall = "full" | "partial" | "failed" | "empty";

export function scanStatusBadgeProps(status: ScanStatus): {
  variant: "outline" | "destructive" | "secondary";
  className?: string;
} {
  switch (status) {
    case "queued":
      return { variant: "secondary" };
    case "running":
      return {
        variant: "outline",
        className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
      };
    case "completed":
      return {
        variant: "outline",
        className:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "failed":
      return { variant: "destructive" };
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

export function coverageBadgeProps(overall: CoverageOverall): {
  variant: "outline" | "destructive" | "secondary";
  className?: string;
} {
  switch (overall) {
    case "full":
      return {
        variant: "outline",
        className:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "partial":
      return {
        variant: "outline",
        className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    case "failed":
      return { variant: "destructive" };
    case "empty":
      return { variant: "secondary" };
  }
}

export function coverageLabel(overall: CoverageOverall): string {
  switch (overall) {
    case "full":
      return "Full coverage";
    case "partial":
      return "Partial coverage";
    case "failed":
      return "No coverage";
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
      return lastValidationMessage ?? "Invalid — revalidate or recreate before launching a scan.";
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
