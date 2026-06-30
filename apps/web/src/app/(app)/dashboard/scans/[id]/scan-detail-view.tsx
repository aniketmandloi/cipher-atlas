"use client";

import Link from "next/link";

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import {
  coverageBadgeProps,
  coverageLabel,
  formatDate,
  scanStatusBadgeProps,
  scanStatusLabel,
  type CoverageOverall,
  type ScanStatus,
} from "../scans-utils";
import FindingsBrowse from "./findings-browse";

interface Props {
  scanId: string;
}

type CoverageStatus = "completed" | "partial" | "failed" | "skipped" | "unsupported";

function coverageStatusBadgeProps(status: CoverageStatus): {
  variant: "outline" | "destructive" | "secondary";
  className?: string;
} {
  switch (status) {
    case "completed":
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
    case "skipped":
    case "unsupported":
      return { variant: "secondary" };
  }
}

function coverageStatusLabel(status: CoverageStatus): string {
  switch (status) {
    case "completed":
      return "Scanned";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "unsupported":
      return "Unsupported";
  }
}

function sliceActionableMessage(
  status: CoverageStatus,
  detailMessage: string | null,
): string | null {
  if (status === "completed") return null;
  if (status === "failed" && detailMessage) {
    return `${detailMessage} Re-check the connector's read scope and revalidate before retrying.`;
  }
  if (detailMessage) return detailMessage;
  switch (status) {
    case "failed":
      return "Access denied or connection error — re-check the connector's read scope and revalidate.";
    case "skipped":
      return "This connector was skipped during the scan.";
    case "unsupported":
      return "This connector source type is not yet supported for scanning.";
    default:
      return null;
  }
}

export default function ScanDetailView({ scanId }: Props) {
  const scanQuery = useQuery(trpc.scans.get.queryOptions({ id: scanId }));

  if (scanQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading scan…</p>;
  }

  if (scanQuery.isError) {
    const isNotFound = scanQuery.error.data?.code === "NOT_FOUND";
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-destructive">
          {isNotFound ? "This scan could not be found." : "Failed to load scan."}
        </p>
        <Link
          href="/dashboard/scans"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to scans
        </Link>
      </div>
    );
  }

  const scan = scanQuery.data;
  if (!scan) return null;

  const overall = scan.coverageSummary.overall as CoverageOverall;
  const { className: covCls, ...covProps } = coverageBadgeProps(overall);
  const { className: statusCls, ...statusProps } = scanStatusBadgeProps(scan.status as ScanStatus);
  const showCoverage = scan.status === "completed" || scan.status === "failed";

  return (
    <div className="space-y-10">
      {/* Coverage banner */}
      {showCoverage && (
        <ScrollReveal delay={0}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="font-display text-lg font-medium">
                  {overall === "full" && "All selected sources scanned"}
                  {overall === "partial" && "Some sources were not fully scanned"}
                  {overall === "failed" && "Scan could not cover the selected sources"}
                  {overall === "empty" && "No coverage data available"}
                </CardTitle>
                <Badge {...covProps} className={`shrink-0 px-2.5 ${covCls ?? ""}`}>
                  {coverageLabel(overall)}
                </Badge>
              </div>
            </CardHeader>
            {(scan.status === "queued" || scan.status === "running") && overall === "full" && (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  All selected sources were scanned. Findings will appear here after the scan
                  completes.
                </p>
              </CardContent>
            )}
          </Card>
        </ScrollReveal>
      )}

      {/* Per-connector coverage breakdown */}
      {showCoverage && (scan.coverageSlices?.length ?? 0) > 0 && (
        <ScrollReveal delay={0.04}>
          <div className="space-y-4">
            <p className="text-sm font-medium">Coverage Breakdown</p>
            <div className="space-y-3">
              {(scan.coverageSlices ?? []).map((slice) => {
                const sliceStatus = slice.coverageStatus as CoverageStatus;
                const { className: sliceCls, ...sliceProps } = coverageStatusBadgeProps(sliceStatus);
                const actionable = sliceActionableMessage(sliceStatus, slice.detailMessage);
                return (
                  <Card key={slice.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{slice.connectorDisplayName}</p>
                          {slice.sourceType && (
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              {slice.sourceType}
                              {slice.segmentLabel ? ` · ${slice.segmentLabel}` : ""}
                            </p>
                          )}
                          {actionable && (
                            <p className="pt-1 text-xs text-muted-foreground">{actionable}</p>
                          )}
                        </div>
                        <Badge
                          {...sliceProps}
                          className={`shrink-0 px-2.5 ${sliceCls ?? ""}`}
                        >
                          {coverageStatusLabel(sliceStatus)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      )}

      {scan.status === "completed" && (
        <FindingsBrowse scanId={scanId} coverageOverall={overall} />
      )}

      {/* Audit block */}
      <ScrollReveal delay={0.08}>
        <div className="space-y-4">
          <p className="text-sm font-medium">Audit Details</p>
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <div className="mt-1">
                    <Badge {...statusProps} className={`px-2.5 ${statusCls ?? ""}`}>
                      {scanStatusLabel(scan.status as ScanStatus)}
                    </Badge>
                  </div>
                </div>
                {showCoverage && (
                  <div>
                    <p className="text-muted-foreground">Coverage</p>
                    <div className="mt-1">
                      <Badge {...covProps} className={`px-2.5 ${covCls ?? ""}`}>
                        {coverageLabel(overall)}
                      </Badge>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Queued</p>
                  <p className="mt-0.5">{formatDate(scan.queuedAt)}</p>
                </div>
                {scan.startedAt && (
                  <div>
                    <p className="text-muted-foreground">Started</p>
                    <p className="mt-0.5">{formatDate(scan.startedAt)}</p>
                  </div>
                )}
                {scan.completedAt && (
                  <div>
                    <p className="text-muted-foreground">Completed</p>
                    <p className="mt-0.5">{formatDate(scan.completedAt)}</p>
                  </div>
                )}
                {scan.failedAt && (
                  <div>
                    <p className="text-muted-foreground">Failed At</p>
                    <p className="mt-0.5">{formatDate(scan.failedAt)}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-muted-foreground">Connector Scope</p>
                  <p className="mt-0.5">
                    {scan.connectors.length > 0
                      ? scan.connectors.map((c) => c.displayName).join(", ")
                      : "—"}
                  </p>
                </div>
                {scan.failureMessage && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Failure Reason</p>
                    <p className="mt-0.5 text-destructive">{scan.failureMessage}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollReveal>

    </div>
  );
}
