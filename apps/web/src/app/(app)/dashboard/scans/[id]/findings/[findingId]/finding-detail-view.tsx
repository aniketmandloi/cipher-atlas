"use client";

import Link from "next/link";
import NextLink from "next/link";

type Href = Parameters<typeof NextLink>[0]["href"];

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { categoryLabel, assetClassLabel } from "../../findings-labels";
import { formatDate } from "../../../scans-utils";

interface Props {
  scanId: string;
  findingId: string;
  browseFiltersQuery: string;
}

export default function FindingDetailView({ scanId, findingId, browseFiltersQuery }: Props) {
  const findingQuery = useQuery(
    trpc.findings.get.queryOptions({ scanId, findingId }),
  );

  const backHref = `/dashboard/scans/${scanId}${browseFiltersQuery ? `?${browseFiltersQuery}` : ""}` as Href;

  if (findingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading finding…</p>;
  }

  if (findingQuery.isError) {
    const isNotFound = findingQuery.error.data?.code === "NOT_FOUND";
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-destructive">
          {isNotFound ? "This finding could not be found." : "Failed to load finding."}
        </p>
        <Link
          href={backHref}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to scan
        </Link>
      </div>
    );
  }

  const data = findingQuery.data;
  if (!data) return null;

  const { finding, snapshot } = data;

  return (
    <div className="space-y-8">
      <ScrollReveal delay={0}>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="font-display text-xl font-medium">{finding.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {categoryLabel(finding.category)} · {finding.code}
                </p>
              </div>
              <Badge variant="outline">{categoryLabel(finding.category)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Source system</p>
                <p className="mt-0.5 font-medium">{finding.sourceType.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source reference</p>
                <p className="mt-0.5 break-all">{finding.sourceRef}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Connector</p>
                <p className="mt-0.5">{finding.connectorDisplayName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Detected</p>
                <p className="mt-0.5">{formatDate(finding.detectedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Asset</p>
                <p className="mt-0.5">{finding.assetIdentifier ?? finding.assetId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Asset class</p>
                <p className="mt-0.5">{assetClassLabel(finding.assetClass)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Rationale</p>
              <p className="mt-1 leading-relaxed">{finding.rationale}</p>
            </div>

            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Evidence envelope
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Evidence source reference</p>
                  <p className="mt-0.5 break-all">{finding.evidence.sourceRef}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Locator</p>
                  <p className="mt-0.5 break-all">{finding.evidence.locator}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Captured</p>
                  <p className="mt-0.5">{formatDate(finding.evidence.capturedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Redaction status</p>
                  <p className="mt-0.5">
                    {finding.evidence.redacted ? "Redacted" : "Not redacted"}
                  </p>
                  {finding.evidence.redacted && finding.evidence.redaction.fields.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Redacted fields: {finding.evidence.redaction.fields.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {finding.evidence.certificate && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Certificate lifecycle
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="mt-0.5">{finding.evidence.certificate.subject}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Issuer</p>
                    <p className="mt-0.5">{finding.evidence.certificate.issuer}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Serial number</p>
                    <p className="mt-0.5 break-all">{finding.evidence.certificate.serialNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fingerprint</p>
                    <p className="mt-0.5 break-all">{finding.evidence.certificate.fingerprint}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Validity period</p>
                    <p className="mt-0.5">
                      {formatDate(finding.evidence.certificate.notBefore)} –{" "}
                      {formatDate(finding.evidence.certificate.notAfter)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Snapshot provenance
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Snapshot ID</p>
                  <p className="mt-0.5 break-all font-mono text-xs">{snapshot.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Published</p>
                  <p className="mt-0.5">{formatDate(snapshot.publishedAt)}</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className="mt-0.5">Not prioritized yet</p>
            </div>
          </CardContent>
        </Card>
      </ScrollReveal>
    </div>
  );
}
