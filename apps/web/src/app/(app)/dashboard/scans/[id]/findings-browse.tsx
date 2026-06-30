"use client";

import Link from "next/link";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Href = Parameters<typeof NextLink>[0]["href"];

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Button } from "@cipher-atlas/ui/components/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { formatDate, type CoverageOverall } from "../scans-utils";
import { assetClassLabel, categoryLabel, nistMappingTypeBadgeVariant, nistMappingTypeLabel, replacementPriorityLabel, riskLevelBadgeVariant, riskLevelLabel } from "./findings-labels";

interface Props {
  scanId: string;
  coverageOverall: CoverageOverall;
}

type FindingCategory = "certificate" | "tls" | "dependency" | "hndl";
type RiskLevel = "critical" | "high" | "medium" | "low";
type CategoryFilter = "all" | FindingCategory;
type RiskLevelFilter = "all" | RiskLevel;
type SourceFilter = "all" | "github" | "aws";
type AssetClassFilter = "all" | "certificate" | "tls_config" | "dependency" | "hndl_signal";
type StandardsFilter = "all" | "with" | "without";

const RISK_LEVEL_CARDS: Array<{
  key: RiskLevel;
  label: string;
}> = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

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

function buildFilterQueryString(filters: {
  category: CategoryFilter;
  riskLevel: RiskLevelFilter;
  source: SourceFilter;
  assetClass: AssetClassFilter;
  standards: StandardsFilter;
}): string {
  const params = new URLSearchParams();
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.riskLevel !== "all") params.set("riskLevel", filters.riskLevel);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.assetClass !== "all") params.set("assetClass", filters.assetClass);
  if (filters.standards !== "all") params.set("standards", filters.standards);
  return params.toString();
}

function readBrowseFilters(searchParams: Pick<URLSearchParams, "get">): {
  category: CategoryFilter;
  riskLevel: RiskLevelFilter;
  source: SourceFilter;
  assetClass: AssetClassFilter;
  standards: StandardsFilter;
} {
  const category = searchParams.get("category");
  const riskLevel = searchParams.get("riskLevel");
  const source = searchParams.get("source");
  const assetClass = searchParams.get("assetClass");
  const standards = searchParams.get("standards");

  return {
    category:
      category === "certificate" ||
      category === "tls" ||
      category === "dependency" ||
      category === "hndl"
        ? category
        : "all",
    riskLevel:
      riskLevel === "critical" ||
      riskLevel === "high" ||
      riskLevel === "medium" ||
      riskLevel === "low"
        ? riskLevel
        : "all",
    source: source === "github" || source === "aws" ? source : "all",
    assetClass:
      assetClass === "certificate" ||
      assetClass === "tls_config" ||
      assetClass === "dependency" ||
      assetClass === "hndl_signal"
        ? assetClass
        : "all",
    standards: standards === "with" || standards === "without" ? standards : "all",
  };
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlFilters = readBrowseFilters(searchParams);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(urlFilters.category);
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevelFilter>(urlFilters.riskLevel);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(urlFilters.source);
  const [assetClassFilter, setAssetClassFilter] = useState<AssetClassFilter>(urlFilters.assetClass);
  const [standardsFilter, setStandardsFilter] = useState<StandardsFilter>(urlFilters.standards);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  useEffect(() => {
    const nextFilters = readBrowseFilters(searchParams);
    setCategoryFilter(nextFilters.category);
    setRiskLevelFilter(nextFilters.riskLevel);
    setSourceFilter(nextFilters.source);
    setAssetClassFilter(nextFilters.assetClass);
    setStandardsFilter(nextFilters.standards);
  }, [searchParams]);

  const filterQueryString = useMemo(
    () =>
      buildFilterQueryString({
        category: categoryFilter,
        riskLevel: riskLevelFilter,
        source: sourceFilter,
        assetClass: assetClassFilter,
        standards: standardsFilter,
      }),
    [categoryFilter, riskLevelFilter, sourceFilter, assetClassFilter, standardsFilter],
  );

  const queryInput = useMemo(
    () => ({
      scanId,
      ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
      ...(riskLevelFilter !== "all" ? { riskLevel: riskLevelFilter } : {}),
      ...(sourceFilter !== "all" ? { sourceType: sourceFilter } : {}),
      ...(assetClassFilter !== "all" ? { assetClass: assetClassFilter } : {}),
      ...(standardsFilter === "with"
        ? { standardsRelevant: true }
        : standardsFilter === "without"
          ? { standardsRelevant: false }
          : {}),
      limit: 100,
      offset: 0,
    }),
    [scanId, categoryFilter, riskLevelFilter, sourceFilter, assetClassFilter, standardsFilter],
  );

  const findingsQuery = useQuery({
    ...trpc.findings.list.queryOptions(queryInput),
    enabled: Boolean(scanId),
  });

  const items = findingsQuery.data?.items ?? [];
  const facetCounts = findingsQuery.data?.facetCounts;
  const filteredTotal = findingsQuery.data?.page.filteredTotal ?? 0;
  const selectedFinding = items.find((item) => item.id === selectedFindingId) ?? null;
  const hasMoreFindings = filteredTotal > items.length;

  const totalFindings = facetCounts
    ? Object.values(facetCounts.categoryCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  function applyBrowseFilters(nextFilters: Partial<{
    category: CategoryFilter;
    riskLevel: RiskLevelFilter;
    source: SourceFilter;
    assetClass: AssetClassFilter;
    standards: StandardsFilter;
  }>) {
    const filters = {
      category: nextFilters.category ?? categoryFilter,
      riskLevel: nextFilters.riskLevel ?? riskLevelFilter,
      source: nextFilters.source ?? sourceFilter,
      assetClass: nextFilters.assetClass ?? assetClassFilter,
      standards: nextFilters.standards ?? standardsFilter,
    };
    const nextQueryString = buildFilterQueryString(filters);

    setCategoryFilter(filters.category);
    setRiskLevelFilter(filters.riskLevel);
    setSourceFilter(filters.source);
    setAssetClassFilter(filters.assetClass);
    setStandardsFilter(filters.standards);
    setSelectedFindingId(null);
    router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, { scroll: false });
  }

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
                    onClick={() => applyBrowseFilters({ category: card.key })}
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
              onClick={() => applyBrowseFilters({ category: "all" })}
            >
              All categories
            </FilterButton>
            {CATEGORY_CARDS.map((card) => (
              <FilterButton
                key={card.key}
                active={categoryFilter === card.key}
                onClick={() => applyBrowseFilters({ category: card.key })}
              >
                {card.label}
              </FilterButton>
            ))}
          </div>

          {(facetCounts?.riskLevelCounts && totalFindings > 0) && (
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={riskLevelFilter === "all"}
                onClick={() => applyBrowseFilters({ riskLevel: "all" })}
              >
                All risk levels
              </FilterButton>
              {RISK_LEVEL_CARDS.map((card) => {
                const count = facetCounts.riskLevelCounts[card.key] ?? 0;
                return (
                  <FilterButton
                    key={card.key}
                    active={riskLevelFilter === card.key}
                    onClick={() => applyBrowseFilters({ riskLevel: card.key })}
                  >
                    {card.label} ({count})
                  </FilterButton>
                );
              })}
            </div>
          )}

          {(facetCounts?.sourceCounts.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={sourceFilter === "all"}
                onClick={() => applyBrowseFilters({ source: "all" })}
              >
                All sources
              </FilterButton>
              {facetCounts?.sourceCounts.map((entry) => (
                <FilterButton
                  key={entry.sourceType}
                  active={sourceFilter === entry.sourceType}
                  onClick={() => applyBrowseFilters({ source: entry.sourceType })}
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
                onClick={() => applyBrowseFilters({ assetClass: "all" })}
              >
                All asset classes
              </FilterButton>
              {facetCounts?.assetClassCounts.map((entry) => (
                <FilterButton
                  key={entry.assetClass}
                  active={assetClassFilter === entry.assetClass}
                  onClick={() => applyBrowseFilters({ assetClass: entry.assetClass })}
                >
                  {assetClassLabel(entry.assetClass)} ({entry.count})
                </FilterButton>
              ))}
            </div>
          )}

          {totalFindings > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Standards relevance
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={standardsFilter === "all"}
                  onClick={() => applyBrowseFilters({ standards: "all" })}
                >
                  All findings
                </FilterButton>
                <FilterButton
                  active={standardsFilter === "with"}
                  onClick={() => applyBrowseFilters({ standards: "with" })}
                >
                  With NIST mapping ({facetCounts?.standardsRelevantCount ?? 0})
                </FilterButton>
                <FilterButton
                  active={standardsFilter === "without"}
                  onClick={() => applyBrowseFilters({ standards: "without" })}
                >
                  No NIST mapping ({totalFindings - (facetCounts?.standardsRelevantCount ?? 0)})
                </FilterButton>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Drill-down</p>
              <p className="text-xs text-muted-foreground">
                {hasMoreFindings
                  ? `Showing first ${items.length} of ${filteredTotal} matching`
                  : `${filteredTotal} matching`}
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
                const detailHref = `/dashboard/scans/${scanId}/findings/${item.id}${
                  filterQueryString ? `?${filterQueryString}` : ""
                }` as Href;
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
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant={riskLevelBadgeVariant(item.riskLevel)}>
                              {riskLevelLabel(item.riskLevel)}
                            </Badge>
                            <Badge variant="outline">{replacementPriorityLabel(item.replacementPriority)}</Badge>
                            {item.nistMapping && (
                              <Badge variant={nistMappingTypeBadgeVariant(item.nistMapping.mappingType)}>
                                {item.nistMapping.references[0]?.id ?? "NIST"} ·{" "}
                                {item.nistMapping.mappingType === "direct" ? "Direct" : "Interpretation"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                          {item.rationale}
                        </p>
                      </button>
                      <div className="mt-3">
                        <Link
                          href={detailHref}
                          className="text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          Open detail
                        </Link>
                      </div>
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
                        <p className="text-muted-foreground">Risk level</p>
                        <p className="mt-0.5">
                          <Badge variant={riskLevelBadgeVariant(selectedFinding.riskLevel)}>
                            {riskLevelLabel(selectedFinding.riskLevel)}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Replacement priority</p>
                        <p className="mt-0.5">
                          {replacementPriorityLabel(selectedFinding.replacementPriority)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">NIST guidance</p>
                      {selectedFinding.nistMapping ? (
                        <div className="mt-1 space-y-1">
                          <Badge variant={nistMappingTypeBadgeVariant(selectedFinding.nistMapping.mappingType)}>
                            {nistMappingTypeLabel(selectedFinding.nistMapping.mappingType)}
                          </Badge>
                          <p>{selectedFinding.nistMapping.references[0]?.id}</p>
                          <p className="text-muted-foreground">{selectedFinding.nistMapping.summary}</p>
                        </div>
                      ) : (
                        <p className="mt-0.5 text-muted-foreground">No NIST mapping for this finding</p>
                      )}
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
                    <div className="border-t pt-3">
                      <Link
                        href={
                          `/dashboard/scans/${scanId}/findings/${selectedFinding.id}${
                            filterQueryString ? `?${filterQueryString}` : ""
                          }` as Href
                        }
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        Open full detail
                      </Link>
                    </div>
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
