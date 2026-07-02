"use client";

import type { Route } from "next";
import Link from "next/link";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Href = Parameters<typeof NextLink>[0]["href"];

import type { FindingsBrowseItem } from "@cipher-atlas/api/routers/findings";
import { Badge } from "@cipher-atlas/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { Input } from "@cipher-atlas/ui/components/input";
import { BottomSheet, Button, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ListSkeleton } from "@/components/list-skeleton";
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

const PAGE_SIZE = 25;

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
  { key: "certificate", label: "Certificates", description: "Expired, expiring, or quantum-vulnerable certificates" },
  { key: "tls", label: "TLS", description: "Outdated protocols and weak ciphers" },
  { key: "dependency", label: "Dependencies", description: "Vulnerable packages" },
  { key: "hndl", label: "HNDL", description: "Harvest-now-decrypt-later exposure" },
];

interface BrowseFilters {
  category: CategoryFilter;
  riskLevel: RiskLevelFilter;
  source: SourceFilter;
  assetClass: AssetClassFilter;
  standards: StandardsFilter;
  search: string;
  page: number;
}

function buildFilterQueryString(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.riskLevel !== "all") params.set("riskLevel", filters.riskLevel);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.assetClass !== "all") params.set("assetClass", filters.assetClass);
  if (filters.standards !== "all") params.set("standards", filters.standards);
  if (filters.search) params.set("q", filters.search);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

function readBrowseFilters(searchParams: Pick<URLSearchParams, "get">): BrowseFilters {
  const category = searchParams.get("category");
  const riskLevel = searchParams.get("riskLevel");
  const source = searchParams.get("source");
  const assetClass = searchParams.get("assetClass");
  const standards = searchParams.get("standards");
  const search = searchParams.get("q") ?? "";
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);

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
    search: search.slice(0, 200),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isDesktop;
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
      aria-pressed={active}
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
  const [filters, setFilters] = useState<BrowseFilters>(urlFilters);
  const [searchDraft, setSearchDraft] = useState(urlFilters.search);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const nextFilters = readBrowseFilters(searchParams);
    setFilters(nextFilters);
    setSearchDraft(nextFilters.search);
  }, [searchParams]);

  // Debounce free-text search into the applied filters + URL.
  const searchDebounceRef = useRef<number | undefined>(undefined);
  function handleSearchChange(value: string) {
    setSearchDraft(value);
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      applyBrowseFilters({ search: value.trim() });
    }, 300);
  }
  useEffect(() => () => window.clearTimeout(searchDebounceRef.current), []);

  const filterQueryString = useMemo(
    () => buildFilterQueryString({ ...filters, page: 1 }),
    [filters],
  );

  const queryInput = useMemo(
    () => ({
      scanId,
      ...(filters.category !== "all" ? { category: filters.category } : {}),
      ...(filters.riskLevel !== "all" ? { riskLevel: filters.riskLevel } : {}),
      ...(filters.source !== "all" ? { sourceType: filters.source } : {}),
      ...(filters.assetClass !== "all" ? { assetClass: filters.assetClass } : {}),
      ...(filters.standards === "with"
        ? { standardsRelevant: true }
        : filters.standards === "without"
          ? { standardsRelevant: false }
          : {}),
      ...(filters.search ? { search: filters.search } : {}),
      limit: PAGE_SIZE,
      offset: (filters.page - 1) * PAGE_SIZE,
    }),
    [scanId, filters],
  );

  const findingsQuery = useQuery({
    ...trpc.findings.list.queryOptions(queryInput),
    enabled: Boolean(scanId),
    placeholderData: keepPreviousData,
  });

  const items = findingsQuery.data?.items ?? [];
  const facetCounts = findingsQuery.data?.facetCounts;
  const filteredTotal = findingsQuery.data?.page.filteredTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const selectedFinding = items.find((item) => item.id === selectedFindingId) ?? null;

  const totalFindings = facetCounts
    ? Object.values(facetCounts.categoryCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  function applyBrowseFilters(nextFilters: Partial<BrowseFilters>) {
    // Any filter/search change resets pagination unless the change itself is a page change.
    const next: BrowseFilters = {
      ...filters,
      ...nextFilters,
      page: nextFilters.page ?? 1,
    };
    setFilters(next);
    if (nextFilters.page === undefined) {
      setSelectedFindingId(null);
    }
    const nextQueryString = buildFilterQueryString(next);
    router.replace((nextQueryString ? `${pathname}?${nextQueryString}` : pathname) as Route, {
      scroll: false,
    });
  }

  if (findingsQuery.isLoading) {
    return (
      <ScrollReveal delay={0.12}>
        <div className="space-y-4">
          <p className="text-sm font-medium">Findings</p>
          <ListSkeleton rows={4} rowHeight="h-24" />
        </div>
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
            const active = filters.category === card.key;

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

          <Input
            type="search"
            value={searchDraft}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search findings by title, rationale, or source…"
            aria-label="Search findings"
            className="max-w-md"
          />

          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={filters.category === "all"}
              onClick={() => applyBrowseFilters({ category: "all" })}
            >
              All categories
            </FilterButton>
            {CATEGORY_CARDS.map((card) => (
              <FilterButton
                key={card.key}
                active={filters.category === card.key}
                onClick={() => applyBrowseFilters({ category: card.key })}
              >
                {card.label}
              </FilterButton>
            ))}
          </div>

          {(facetCounts?.riskLevelCounts && totalFindings > 0) && (
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={filters.riskLevel === "all"}
                onClick={() => applyBrowseFilters({ riskLevel: "all" })}
              >
                All risk levels
              </FilterButton>
              {RISK_LEVEL_CARDS.map((card) => {
                const count = facetCounts.riskLevelCounts[card.key] ?? 0;
                return (
                  <FilterButton
                    key={card.key}
                    active={filters.riskLevel === card.key}
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
                active={filters.source === "all"}
                onClick={() => applyBrowseFilters({ source: "all" })}
              >
                All sources
              </FilterButton>
              {facetCounts?.sourceCounts.map((entry) => (
                <FilterButton
                  key={entry.sourceType}
                  active={filters.source === entry.sourceType}
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
                active={filters.assetClass === "all"}
                onClick={() => applyBrowseFilters({ assetClass: "all" })}
              >
                All asset classes
              </FilterButton>
              {facetCounts?.assetClassCounts.map((entry) => (
                <FilterButton
                  key={entry.assetClass}
                  active={filters.assetClass === entry.assetClass}
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
                  active={filters.standards === "all"}
                  onClick={() => applyBrowseFilters({ standards: "all" })}
                >
                  All findings
                </FilterButton>
                <FilterButton
                  active={filters.standards === "with"}
                  onClick={() => applyBrowseFilters({ standards: "with" })}
                >
                  With NIST mapping ({facetCounts?.standardsRelevantCount ?? 0})
                </FilterButton>
                <FilterButton
                  active={filters.standards === "without"}
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
                {filteredTotal === 0
                  ? "0 matching"
                  : `${filteredTotal} matching · page ${filters.page} of ${totalPages}`}
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
              <div className={findingsQuery.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
                <div className="space-y-3">
                  {items.map((item) => {
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
                            aria-expanded={selected}
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
                  })}
                </div>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1 || findingsQuery.isPlaceholderData}
                  onClick={() => applyBrowseFilters({ page: filters.page - 1 })}
                >
                  Previous
                </Button>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Page {filters.page} of {totalPages}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages || findingsQuery.isPlaceholderData}
                  onClick={() => applyBrowseFilters({ page: filters.page + 1 })}
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          <div className="hidden space-y-3 lg:block">
            <p className="text-sm font-medium">Finding detail</p>
            <Card className="lg:sticky lg:top-6">
              <CardContent className="pt-4">
                {!selectedFinding ? (
                  <p className="text-sm text-muted-foreground">
                    Select a finding to inspect evidence, source reference, and rationale without
                    losing your current filters.
                  </p>
                ) : (
                  <FindingDetailPanel
                    finding={selectedFinding}
                    scanId={scanId}
                    filterQueryString={filterQueryString}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {!isDesktop && (
          <BottomSheet
            open={Boolean(selectedFinding)}
            onOpenChange={(open) => {
              if (!open) setSelectedFindingId(null);
            }}
            title={selectedFinding?.title}
            snapPoints={[0.7, 0.95]}
          >
            {selectedFinding && (
              <div className="px-1 pb-6">
                <FindingDetailPanel
                  finding={selectedFinding}
                  scanId={scanId}
                  filterQueryString={filterQueryString}
                />
              </div>
            )}
          </BottomSheet>
        )}
      </div>
    </ScrollReveal>
  );
}

function FindingDetailPanel({
  finding,
  scanId,
  filterQueryString,
}: {
  // Dates arrive serialized over the tRPC HTTP boundary.
  finding: Omit<FindingsBrowseItem, "detectedAt"> & { detectedAt: Date | string };
  scanId: string;
  filterQueryString: string;
}) {
  return (
    <div className="space-y-4 text-xs">
      <div>
        <p className="text-muted-foreground">Title</p>
        <p className="mt-0.5 text-sm font-medium">{finding.title}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground">Category</p>
          <p className="mt-0.5">{categoryLabel(finding.category)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Code</p>
          <p className="mt-0.5">{finding.code}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Source</p>
          <p className="mt-0.5 break-all">
            {finding.sourceType.toUpperCase()} · {finding.sourceRef}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Connector</p>
          <p className="mt-0.5">{finding.connectorDisplayName}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Asset</p>
          <p className="mt-0.5 break-all">{finding.assetIdentifier ?? finding.assetId}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Asset class</p>
          <p className="mt-0.5">{assetClassLabel(finding.assetClass)}</p>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground">Rationale</p>
        <p className="mt-0.5">{finding.rationale}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Evidence locator</p>
        <p className="mt-0.5 break-all">{finding.evidence.locator}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground">Risk level</p>
          <p className="mt-0.5">
            <Badge variant={riskLevelBadgeVariant(finding.riskLevel)}>
              {riskLevelLabel(finding.riskLevel)}
            </Badge>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Replacement priority</p>
          <p className="mt-0.5">{replacementPriorityLabel(finding.replacementPriority)}</p>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground">NIST guidance</p>
        {finding.nistMapping ? (
          <div className="mt-1 space-y-1">
            <Badge variant={nistMappingTypeBadgeVariant(finding.nistMapping.mappingType)}>
              {nistMappingTypeLabel(finding.nistMapping.mappingType)}
            </Badge>
            <p>{finding.nistMapping.references[0]?.id}</p>
            <p className="text-muted-foreground">{finding.nistMapping.summary}</p>
          </div>
        ) : (
          <p className="mt-0.5 text-muted-foreground">No NIST mapping for this finding</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground">Captured</p>
          <p className="mt-0.5">{formatDate(finding.evidence.capturedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Redaction</p>
          <p className="mt-0.5">{finding.evidence.redacted ? "Redacted" : "Not redacted"}</p>
        </div>
      </div>
      {finding.evidence.certificate && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-muted-foreground">Certificate evidence</p>
          <p>Subject: {finding.evidence.certificate.subject}</p>
          <p>Issuer: {finding.evidence.certificate.issuer}</p>
          <p>
            Valid: {formatDate(finding.evidence.certificate.notBefore)} –{" "}
            {formatDate(finding.evidence.certificate.notAfter)}
          </p>
        </div>
      )}
      <div className="border-t pt-3">
        <Link
          href={
            `/dashboard/scans/${scanId}/findings/${finding.id}${
              filterQueryString ? `?${filterQueryString}` : ""
            }` as Href
          }
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Open full detail
        </Link>
      </div>
    </div>
  );
}

