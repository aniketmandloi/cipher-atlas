import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { authClient } from "@/lib/auth-client";

import ScanDetailView from "./scan-detail-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ScanDetailPage({ params }: Props) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="pb-10">
        {/* Breadcrumb + back button */}
        <div className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/dashboard/scans"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            Scans
          </Link>
          <span>/</span>
          <span className="text-foreground">Scan Detail</span>
        </div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Scan Detail</h1>
      </div>
      <ScanDetailView scanId={id} />
    </div>
  );
}
