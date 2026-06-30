import { headers } from "next/headers";
import Link from "next/link";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

type Href = Parameters<typeof NextLink>[0]["href"];

import { authClient } from "@/lib/auth-client";

import FindingDetailView from "./finding-detail-view";

interface Props {
  params: Promise<{ id: string; findingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildBrowseFiltersQuery(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const allowedKeys = ["category", "source", "assetClass", "riskLevel", "standards"] as const;
  const params = new URLSearchParams();

  for (const key of allowedKeys) {
    const value = searchParams[key];
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }

  return params.toString();
}

export default async function FindingDetailPage({ params, searchParams }: Props) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  const { id, findingId } = await params;
  const resolvedSearchParams = await searchParams;
  const browseFiltersQuery = buildBrowseFiltersQuery(resolvedSearchParams);
  const backHref = `/dashboard/scans/${id}${browseFiltersQuery ? `?${browseFiltersQuery}` : ""}` as Href;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="pb-10">
        <div className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/dashboard/scans"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Scans
          </Link>
          <span>/</span>
          <Link href={backHref} className="transition-colors hover:text-foreground">
            Scan Detail
          </Link>
          <span>/</span>
          <span className="text-foreground">Finding Detail</span>
        </div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Finding Detail</h1>
      </div>
      <FindingDetailView
        scanId={id}
        findingId={findingId}
        browseFiltersQuery={browseFiltersQuery}
      />
    </div>
  );
}
