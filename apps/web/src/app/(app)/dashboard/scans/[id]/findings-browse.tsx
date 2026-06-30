"use client";

import { useMemo, useState } from "react";

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Button } from "@cipher-atlas/ui/components/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { formatDate, type CoverageOverall } from "../scans-utils";

interface Props {
  scanId: string;
  coverageOverall: CoverageOverall;
}

type FindingCategory = "certificate" | "tls" | "dependency" | "hndl";
type CategoryFilter = "all" | FindingCategory;
type SourceFilter = "all" | "github" | "aws";
type AssetClassFilter = "all" | "certificate" | "tls_config" | "dependency" | "hndl_signal";

const CATEGORY_CARDS: Array<{
  key: FindingCategory;
  label: string;
  description: string;
}> = [
  { key: "certificate", label: "Certificates", description: "Expired or expiring certificates" },
  { key: "tls", label: "TLS", description: "Outdated protocols and weak ciphers" },
  { key: "dependency", label: "Dependencies", description: "Vulnerable packages" },
  { key: "hndl", label: "HNDL", description: "Harvest-now-decrypt-later exposure" },
];

function categoryLabel(category: string): string {
  switch (category) {
    case "certificate":
      return "Certificate";
    case "tls":
      return "TLS";
    case "dependency":
      return "Dependency";
    case "hndl":
      return "HNDL";
    default:
      return category;
  }
}

function assetClassLabel(assetClass: string): string {
  switch (assetClass) {
    case "certificate":
      return "Certificate";
    case "tls_config":
      return "TLS Config";
    case "dependency":
      return "Dependency";
    case "hndl_signal":
      return "HNDL Signal";
    default:
      return assetClass;
  }
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "primary" : "outline"}
      size="sm"
      onClick={onClick}
      className="h-8"
    >
      {children}
    </Button>
  );
}

export default function FindingsBrowse({ scanId, coverageOverall }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClassFilter>("all");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const queryInput = useMemo(
    () => ({
      scanId,
      ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
      ...(sourceFilter !== "all" ? { sourceType: sourceFilter } : {}),
      ...(assetClassFilter !== "all" ? { assetClass: assetClassFilter } : {}),
      limit: 100,
      offset: 0,
    }),
    [scanId, categoryFilter, sourceFilter, assetClassFilter],
  );

  const findingsQuery = useQuery({
    ...trpc.findings.list.queryOptions(queryInput),
    enabled: Boolean(scanId),
  });

  const items = findingsQuery.data?.items ?? [];
  const facetCounts = findingsQuery.data?.facetCounts;
  const selectedFinding = items.find((item) => item.id === selectedFindingId) ?? null;

  const totalFindings = facetCounts
    ? Object.values(facetCounts.categoryCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  if (findingsQuery.isLoading) {
    return (
      <ScrollReveal delay={0.12}>
        <p className="text-sm text-muted-foreground">Loading findings…</p>
      </ScrollReveal>
    );
  }

  if (findingsQuery.isError) {
    return (
      <ScrollReveal delay={0.12}>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              {findingsQuery.error.message || "Failed to load findings."}
            </p>
          </CardContent>
        </Card>
      </ScrollReveal>
    );
  }

  return (
    <ScrollReveal delay={0.12}>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">Findings</p>
          <p className="text-sm text-muted-foreground">
            {totalFindings === 0
              ? coverageOverall === "full"
                ? "Full coverage completed with zero findings in this snapshot."
                : "No findings recorded for this snapshot. Review coverage before trusting absence."
              : `${totalFindings} finding${totalFindings === 1 ? "" : "s"} in this completed snapshot.`}
          </p>
          {coverageOverall !== "full" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Coverage was not complete — absence in a category does not prove the scope was fully
              scanned.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CATEGORY_CARDS.map((card) => {
            const count = facetCounts?.categoryCounts[card.key] ?? 0;
            const active = categoryFilter === card.key;

            return (
              <Card
                key={card.key}
                className={active ? "border-primary/50 ring-1 ring-primary/20" : undefined}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                  <FilterButton
                    active={active}
                    onClick={() => {
                      setCategoryFilter(card.key);
                      setSelectedFindingId(null);
                    }}
                  >
                    {count === 0 ? "0 in category" : "View category"}
                  </FilterButton>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filters
          </p>
          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={categoryFilter === "all"}
              onClick={() => {
                setCategoryFilter("all");
                setSelectedFindingId(null);
              }}
            >
              All categories
            </FilterButton>
            {CATEGORY_CARDS.map((card) => (
              <FilterButton
                key={card.key}
                active={categoryFilter === card.key}
                onClick={() => {
                  setCategoryFilter(card.key);
                  setSelectedFindingId(null);
                }}
              >
                {card.label}
              </FilterButton>
            ))}
          </div>

          {(facetCounts?.sourceCounts.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={sourceFilter === "all"}
                onClick={() => {
                  setSourceFilter("all");
                  setSelectedFindingId(null);
                }}
              >
                All sources
              </FilterButton>
              {facetCounts?.sourceCounts.map((entry) => (
                <FilterButton
                  key={entry.sourceType}
                  active={sourceFilter === entry.sourceType}
                  onClick={() => {
                    setSourceFilter(entry.sourceType);
                    setSelectedFindingId(null);
                  }}
                >
                  {entry.sourceType.toUpperCase()} ({entry.count})
                </FilterButton>
              ))}
            </div>
          )}

          {(facetCounts?.assetClassCounts.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={assetClassFilter === "all"}
                onClick={() => {
                  setAssetClassFilter("all");
                  setSelectedFindingId(null);
                }}
              >
                All asset classes
              </FilterButton>
              {facetCounts?.assetClassCounts.map((entry) => (
                <FilterButton
                  key={entry.assetClass}
                  active={assetClassFilter === entry.assetClass}
                  onClick={() => {
                    setAssetClassFilter(entry.assetClass);
                    setSelectedFindingId(null);
                  }}
                >
                  {assetClassLabel(entry.assetClass)} ({entry.count})
                </FilterButton>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Drill-down</p>
              <p className="text-xs text-muted-foreground">
                {findingsQuery.data?.page.filteredTotal ?? 0} matching
              </p>
            </div>

            {items.length === 0 ? (
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    {totalFindings === 0
                      ? "No findings in this snapshot."
                      : "No findings match the current filters."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              items.map((item) => {
                const selected = selectedFindingId === item.id;
                return (
                  <Card
                    key={item.id}
                    className={selected ? "border-primary/50 ring-1 ring-primary/20" : undefined}
                  >
                    <CardContent className="pt-4">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          setSelectedFindingId((current) => (current === item.id ? null : item.id))
                        }
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {categoryLabel(item.category)} · {item.code}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.connectorDisplayName} · {item.sourceType.toUpperCase()}
                            </p>
                          </div>
                          <Badge variant="outline">{categoryLabel(item.category)}</Badge>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                          {item.rationale}
                        </p>
                      </button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Finding detail</p>
            <Card className="lg:sticky lg:top-6">
              <CardContent className="pt-4">
                {!selectedFinding ? (
                  <p className="text-sm text-muted-foreground">
                    Select a finding to inspect evidence, source reference, and rationale without
                    losing your current filters.
                  </p>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div>
                      <p className="text-muted-foreground">Title</p>
                      <p className="mt-0.5 text-sm font-medium">{selectedFinding.title}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-muted-foreground">Category</p>
                        <p className="mt-0.5">{categoryLabel(selectedFinding.category)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Code</p>
                        <p className="mt-0.5">{selectedFinding.code}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Source</p>
                        <p className="mt-0.5">
                          {selectedFinding.sourceType.toUpperCase()} · {selectedFinding.sourceRef}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Connector</p>
                        <p className="mt-0.5">{selectedFinding.connectorDisplayName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Asset</p>
                        <p className="mt-0.5">
                          {selectedFinding.assetIdentifier ?? selectedFinding.assetId}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Asset class</p>
                        <p className="mt-0.5">{assetClassLabel(selectedFinding.assetClass)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Rationale</p>
                      <p className="mt-0.5">{selectedFinding.rationale}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Evidence locator</p>
                      <p className="mt-0.5 break-all">{selectedFinding.evidence.locator}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-muted-foreground">Captured</p>
                        <p className="mt-0.5">{formatDate(selectedFinding.evidence.capturedAt)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Redaction</p>
                        <p className="mt-0.5">
                          {selectedFinding.evidence.redacted ? "Redacted" : "Not redacted"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Priority</p>
                      <p className="mt-0.5">Not prioritized yet</p>
                    </div>
                    {selectedFinding.evidence.certificate && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-muted-foreground">Certificate evidence</p>
                        <p>Subject: {selectedFinding.evidence.certificate.subject}</p>
                        <p>Issuer: {selectedFinding.evidence.certificate.issuer}</p>
                        <p>
                          Valid: {formatDate(selectedFinding.evidence.certificate.notBefore)} –{" "}
                          {formatDate(selectedFinding.evidence.certificate.notAfter)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ScrollReveal>
  );
}
