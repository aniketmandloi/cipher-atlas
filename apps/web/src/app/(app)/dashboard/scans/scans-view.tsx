"use client";

import { useState } from "react";
import type Link from "next/link";
import NextLink from "next/link";

type Href = Parameters<typeof NextLink>[0]["href"];

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Button } from "@cipher-atlas/ui/components/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { ListSkeleton } from "@/components/list-skeleton";
import { trpc } from "@/utils/trpc";
import {
  connectorBlockedMessage,
  coverageBadgeProps,
  coverageLabel,
  formatDate,
  scanStatusBadgeProps,
  scanStatusLabel,
  type ConnectorStatus,
  type CoverageOverall,
  type ScanStatus,
} from "./scans-utils";

export default function ScansView() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const connectorsQuery = useQuery(trpc.connectors.list.queryOptions());
  const scansQuery = useQuery(
    trpc.scans.list.queryOptions(undefined, {
      refetchInterval: (query) =>
        query.state.data?.some((scan) => scan.status === "queued" || scan.status === "running")
          ? 3000
          : false,
    }),
  );
  const scanActive =
    scansQuery.data?.some((scan) => scan.status === "queued" || scan.status === "running") ?? false;

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

          {connectorsQuery.isLoading && <ListSkeleton rows={2} rowHeight="h-12" />}

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
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">Scan History</p>
              {scanActive && (
                <span
                  role="status"
                  aria-live="polite"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400"
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
                  </span>
                  Live — updating
                </span>
              )}
            </div>
            {scans.length > 0 && (
              <button
                type="button"
                aria-label="Refresh scan history"
                onClick={() => void scansQuery.refetch()}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Refresh
              </button>
            )}
          </div>

          {scansQuery.isLoading && <ListSkeleton rows={3} rowHeight="h-32" />}

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
            const overall = scan.coverageSummary.overall as CoverageOverall;
            const showCoverage =
              scan.status === "completed" || scan.status === "failed";
            const { className: covCls, ...covProps } = coverageBadgeProps(overall);

            return (
              <NextLink
                key={scan.id}
                href={`/dashboard/scans/${scan.id}` as Href}
                className="block transition-opacity hover:opacity-80"
              >
                <Card>
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
                      <div className="flex shrink-0 items-center gap-2">
                        {showCoverage && (
                          <Badge {...covProps} className={`px-2.5 ${covCls ?? ""}`}>
                            {coverageLabel(overall)}
                          </Badge>
                        )}
                        <Badge {...badgeProps} className={`px-2.5 ${badgeCls ?? ""}`}>
                          {scanStatusLabel(scan.status as ScanStatus)}
                        </Badge>
                      </div>
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
              </NextLink>
            );
          })}
        </div>
      </ScrollReveal>
    </div>
  );
}
