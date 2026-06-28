"use client";

import { useState } from "react";

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Button } from "@cipher-atlas/ui/components/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

type ScanStatus = "queued" | "running" | "completed" | "failed";
type ConnectorStatus = "pending_validation" | "usable" | "invalid" | "unsupported";

function scanStatusBadgeProps(status: ScanStatus): {
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

function scanStatusLabel(status: ScanStatus): string {
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

function connectorBlockedMessage(
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

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export default function ScansView() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const connectorsQuery = useQuery(trpc.connectors.list.queryOptions());
  const scansQuery = useQuery(trpc.scans.list.queryOptions());

  const launchMutation = useMutation(
    trpc.scans.create.mutationOptions({
      onSuccess: () => {
        void scansQuery.refetch();
        setSelectedIds(new Set());
        toast.success("Scan queued successfully.");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const connectors = connectorsQuery.data ?? [];
  const usableConnectors = connectors.filter((c) => c.status === "usable");
  const blockedConnectors = connectors.filter((c) => c.status !== "usable");
  const scans = scansQuery.data ?? [];

  function toggleConnector(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleLaunch() {
    launchMutation.mutate({ connectorIds: [...selectedIds] });
  }

  return (
    <div className="mt-10 space-y-12">
      {/* Launch Scan */}
      <ScrollReveal delay={0}>
        <div className="space-y-5">
          <p className="text-sm font-medium">Select Connectors</p>

          {connectorsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading connectors…</p>
          )}

          {connectorsQuery.isError && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">Failed to load connectors.</p>
              <button
                type="button"
                onClick={() => void connectorsQuery.refetch()}
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Retry
              </button>
            </div>
          )}

          {!connectorsQuery.isLoading && !connectorsQuery.isError && connectors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No connectors yet. Add a validated connector before launching a scan.
            </p>
          )}

          {usableConnectors.length > 0 && (
            <div className="space-y-2">
              {usableConnectors.map((c) => {
                const selected = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleConnector(c.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
                      selected
                        ? "border-foreground bg-foreground/5"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`size-3 shrink-0 rounded-full border transition-colors ${
                          selected ? "border-foreground bg-foreground" : "border-muted-foreground"
                        }`}
                      />
                      <span className="font-medium">{c.displayName}</span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {c.sourceType}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-emerald-500/40 bg-emerald-500/10 px-2.5 text-emerald-600 dark:text-emerald-400"
                    >
                      Usable
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {blockedConnectors.length > 0 && (
            <div className="space-y-2">
              {blockedConnectors.map((c) => (
                <div
                  key={c.id}
                  className="flex w-full items-start justify-between rounded-xl border border-border px-4 py-3 opacity-50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="size-3 shrink-0 rounded-full border border-muted-foreground" />
                      <span className="text-sm font-medium">{c.displayName}</span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {c.sourceType}
                      </span>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground">
                      {connectorBlockedMessage(
                        c.status as ConnectorStatus,
                        c.lastValidationMessage,
                      )}
                    </p>
                  </div>
                  <Badge
                    variant={
                      c.status === "invalid" || c.status === "unsupported"
                        ? "destructive"
                        : "secondary"
                    }
                    className="shrink-0 px-2.5"
                  >
                    {c.status === "pending_validation"
                      ? "Pending"
                      : c.status === "invalid"
                        ? "Invalid"
                        : "Unsupported"}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {selectedIds.size === 0 && usableConnectors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Select one or more connectors above to launch a scan.
            </p>
          )}

          {selectedIds.size > 0 && (
            <Magnetic strength={0.25}>
              <Button size="md" disabled={launchMutation.isPending} onClick={handleLaunch}>
                {launchMutation.isPending
                  ? "Launching…"
                  : `Launch Scan (${selectedIds.size} connector${selectedIds.size === 1 ? "" : "s"})`}
              </Button>
            </Magnetic>
          )}
        </div>
      </ScrollReveal>

      {/* Scan History */}
      <ScrollReveal delay={0.08}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Scan History</p>
            {scans.length > 0 && (
              <button
                type="button"
                onClick={() => void scansQuery.refetch()}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Refresh
              </button>
            )}
          </div>

          {scansQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading scans…</p>
          )}

          {scansQuery.isError && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">Failed to load scans.</p>
              <button
                type="button"
                onClick={() => void scansQuery.refetch()}
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Retry
              </button>
            </div>
          )}

          {!scansQuery.isLoading && !scansQuery.isError && scans.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No scans yet. Launch your first scan above.
            </p>
          )}

          {scans.map((scan) => {
            const { className: badgeCls, ...badgeProps } = scanStatusBadgeProps(
              scan.status as ScanStatus,
            );
            return (
              <Card key={scan.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="font-display text-base font-medium">
                        {scan.connectors.length > 0
                          ? scan.connectors.map((c) => c.displayName).join(", ")
                          : "No connectors"}
                      </CardTitle>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {scan.connectors.map((c) => c.sourceType).join(" · ")}
                      </p>
                    </div>
                    <Badge {...badgeProps} className={`shrink-0 px-2.5 ${badgeCls ?? ""}`}>
                      {scanStatusLabel(scan.status as ScanStatus)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="mt-0.5">{formatDate(scan.createdAt)}</p>
                    </div>
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
                    {scan.failureMessage && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Failure</p>
                        <p className="mt-0.5 text-destructive">{scan.failureMessage}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollReveal>
    </div>
  );
}
