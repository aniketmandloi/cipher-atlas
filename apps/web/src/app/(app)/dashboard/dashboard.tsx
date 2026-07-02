"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@cipher-atlas/ui/components/chart";
import { Button, Magnetic, NumberTicker, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ChartSkeleton, StatRowSkeleton } from "@/components/list-skeleton";
import { authClient } from "@/lib/auth-client";
import { categoryChartColors, riskLevelChartColors, toneBadgeProps } from "@/lib/status-styles";
import { trpc } from "@/utils/trpc";
import { formatDate, scanStatusBadgeProps, scanStatusLabel, type ScanStatus } from "./scans/scans-utils";

type Href = Parameters<typeof NextLink>[0]["href"];

const riskChartConfig = {
  critical: { label: "Critical", color: riskLevelChartColors.critical },
  high: { label: "High", color: riskLevelChartColors.high },
  medium: { label: "Medium", color: riskLevelChartColors.medium },
  low: { label: "Low", color: riskLevelChartColors.low },
} satisfies ChartConfig;

const categoryChartConfig = {
  count: { label: "Findings" },
  certificate: { label: "Certificates", color: categoryChartColors.certificate },
  tls: { label: "TLS", color: categoryChartColors.tls },
  dependency: { label: "Dependencies", color: categoryChartColors.dependency },
  hndl: { label: "HNDL", color: categoryChartColors.hndl },
} satisfies ChartConfig;

const expiryChartConfig = {
  count: { label: "Certificates", color: "var(--chart-1)" },
} satisfies ChartConfig;

const expiryBucketLabels: Record<string, string> = {
  expired: "Expired",
  "30d": "≤ 30 days",
  "90d": "≤ 90 days",
  "1y": "≤ 1 year",
  later: "> 1 year",
  unknown: "Unknown",
};

export default function Dashboard({
  customerState,
}: {
  customerState: ReturnType<typeof authClient.customer.state>;
  session: typeof authClient.$Infer.Session;
}) {
  const hasProSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;
  const [billingPending, setBillingPending] = useState(false);

  const summaryQuery = useQuery(
    trpc.dashboard.summary.queryOptions(undefined, {
      refetchInterval: (query) => {
        const latest = query.state.data?.latestScan;
        return latest && (latest.status === "queued" || latest.status === "running") ? 3000 : false;
      },
    }),
  );
  const summary = summaryQuery.data;
  const snapshot = summary?.latestSnapshot ?? null;
  const scanActive =
    summary?.latestScan?.status === "queued" || summary?.latestScan?.status === "running";

  const riskData = useMemo(() => {
    if (!snapshot) return [];
    return (["critical", "high", "medium", "low"] as const)
      .map((level) => ({
        level,
        label: riskChartConfig[level].label,
        value: snapshot.riskLevelCounts[level],
        fill: riskLevelChartColors[level],
      }))
      .filter((entry) => entry.value > 0);
  }, [snapshot]);

  const categoryData = useMemo(() => {
    if (!snapshot) return [];
    return (["certificate", "tls", "dependency", "hndl"] as const).map((category) => ({
      category,
      label: categoryChartConfig[category].label as string,
      count: snapshot.categoryCounts[category],
      fill: categoryChartColors[category],
    }));
  }, [snapshot]);

  const expiryData = useMemo(() => {
    if (!snapshot) return [];
    return (["expired", "30d", "90d", "1y", "later"] as const).map((bucket) => ({
      bucket,
      label: expiryBucketLabels[bucket],
      count: snapshot.certificateExpiry[bucket],
    }));
  }, [snapshot]);

  return (
    <div className="mt-10 space-y-10">
      {/* Plan & billing */}
      <ScrollReveal delay={0}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Plan</p>
            <p className="font-display text-2xl font-medium">{hasProSubscription ? "Pro" : "Free"}</p>
          </div>
          <Magnetic strength={0.25}>
            <Button
              size="md"
              disabled={billingPending}
              onClick={async () => {
                setBillingPending(true);
                try {
                  if (hasProSubscription) {
                    await authClient.customer.portal();
                  } else {
                    await authClient.checkout({ slug: "pro" });
                  }
                } finally {
                  setBillingPending(false);
                }
              }}
            >
              {billingPending ? "Loading…" : hasProSubscription ? "Manage Subscription" : "Upgrade to Pro"}
            </Button>
          </Magnetic>
        </div>
      </ScrollReveal>

      {summaryQuery.isLoading && (
        <div className="space-y-6">
          <StatRowSkeleton />
          <div className="grid gap-3 md:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      )}

      {summaryQuery.isError && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">Failed to load the security overview.</p>
          <button
            type="button"
            onClick={() => void summaryQuery.refetch()}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      {summary && (
        <>
          {scanActive && (
            <ScrollReveal delay={0.04}>
              <NextLink href={"/dashboard/scans" as Href} className="block">
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-600 dark:text-blue-400"
                >
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-blue-500" />
                  </span>
                  A scan is {summary.latestScan?.status === "queued" ? "queued" : "running"} — results will
                  appear here automatically.
                </div>
              </NextLink>
            </ScrollReveal>
          )}

          {/* Stat row */}
          <ScrollReveal delay={0.08}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Findings"
                value={snapshot?.totalFindings ?? 0}
                href={snapshot ? `/dashboard/scans/${snapshot.scanId}` : "/dashboard/scans"}
              />
              <StatCard
                label="Critical"
                value={snapshot?.riskLevelCounts.critical ?? 0}
                valueClassName={
                  (snapshot?.riskLevelCounts.critical ?? 0) > 0 ? "text-destructive" : undefined
                }
                href={snapshot ? `/dashboard/scans/${snapshot.scanId}` : "/dashboard/scans"}
              />
              <StatCard
                label="Assets Inventoried"
                value={snapshot?.assetCount ?? 0}
                href={snapshot ? `/dashboard/scans/${snapshot.scanId}` : "/dashboard/scans"}
              />
              <StatCard
                label="Usable Connectors"
                value={summary.connectors.usable}
                suffix={` / ${summary.connectors.total}`}
                href="/dashboard/connectors"
              />
            </div>
          </ScrollReveal>

          {!snapshot && (
            <ScrollReveal delay={0.12}>
              <Card>
                <CardContent className="flex flex-col items-start gap-4 py-10">
                  <div className="space-y-1">
                    <p className="font-display text-lg font-medium">No scan results yet</p>
                    <p className="text-sm text-muted-foreground">
                      Connect GitHub or AWS with read-only credentials, then launch your first scan to map
                      your cryptographic footprint.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Magnetic strength={0.25}>
                      <NextLink href={"/dashboard/connectors" as Href}>
                        <Button size="md">
                          {summary.connectors.usable > 0 ? "Manage connectors" : "Add a connector"}
                        </Button>
                      </NextLink>
                    </Magnetic>
                    {summary.connectors.usable > 0 && (
                      <Magnetic strength={0.25}>
                        <NextLink href={"/dashboard/scans" as Href}>
                          <Button size="md" variant="outline">
                            Launch first scan
                          </Button>
                        </NextLink>
                      </Magnetic>
                    )}
                  </div>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}

          {snapshot && (
            <>
              <ScrollReveal delay={0.12}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-display text-base font-medium">Findings by Risk</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {riskData.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                          No findings in the latest snapshot.
                        </p>
                      ) : (
                        <ChartContainer config={riskChartConfig} className="mx-auto aspect-square max-h-56">
                          <PieChart>
                            <ChartTooltip content={<ChartTooltipContent nameKey="level" hideLabel />} />
                            <Pie
                              data={riskData}
                              dataKey="value"
                              nameKey="level"
                              innerRadius={52}
                              strokeWidth={4}
                            />
                          </PieChart>
                        </ChartContainer>
                      )}
                      {riskData.length > 0 && (
                        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                          {riskData.map((entry) => (
                            <span key={entry.level} className="inline-flex items-center gap-1.5">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: entry.fill }}
                              />
                              {entry.label} · {entry.value}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="font-display text-base font-medium">
                        Findings by Category
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={categoryChartConfig} className="max-h-56 w-full">
                        <BarChart data={categoryData} margin={{ top: 8 }}>
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                          <ChartTooltip content={<ChartTooltipContent nameKey="count" hideLabel />} />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                            {categoryData.map((entry) => (
                              <Cell key={entry.category} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </div>
              </ScrollReveal>

              {snapshot.certificateCount > 0 && (
                <ScrollReveal delay={0.16}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-display text-base font-medium">
                        Certificate Expiry Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={expiryChartConfig} className="max-h-48 w-full">
                        <BarChart data={expiryData} layout="vertical" margin={{ left: 8 }}>
                          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                          <YAxis
                            type="category"
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            width={80}
                            tick={{ fontSize: 12 }}
                          />
                          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                          <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </ScrollReveal>
              )}
            </>
          )}

          {summary.recentScans.length > 0 && (
            <ScrollReveal delay={0.2}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Recent Scans</p>
                  <NextLink
                    href={"/dashboard/scans" as Href}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    View all
                  </NextLink>
                </div>
                <div className="space-y-2">
                  {summary.recentScans.map((scan) => {
                    const { className: badgeCls, ...badgeProps } = scanStatusBadgeProps(
                      scan.status as ScanStatus,
                    );
                    return (
                      <NextLink
                        key={scan.id}
                        href={`/dashboard/scans/${scan.id}` as Href}
                        className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm transition-colors hover:border-foreground/40"
                      >
                        <span className="text-muted-foreground">
                          Queued {formatDate(scan.queuedAt)}
                          {scan.completedAt ? ` · completed ${formatDate(scan.completedAt)}` : ""}
                        </span>
                        <Badge {...badgeProps} className={`shrink-0 px-2.5 ${badgeCls ?? ""}`}>
                          {scanStatusLabel(scan.status as ScanStatus)}
                        </Badge>
                      </NextLink>
                    );
                  })}
                </div>
              </div>
            </ScrollReveal>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  valueClassName,
  href,
}: {
  label: string;
  value: number;
  suffix?: string;
  valueClassName?: string;
  href: string;
}) {
  return (
    <NextLink href={href as Href} className="block transition-opacity hover:opacity-80">
      <Card>
        <CardContent className="space-y-1 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`font-display text-3xl font-medium ${valueClassName ?? ""}`}>
            <NumberTicker value={value} startOnView={false} />
            {suffix && <span className="text-base text-muted-foreground">{suffix}</span>}
          </p>
        </CardContent>
      </Card>
    </NextLink>
  );
}
