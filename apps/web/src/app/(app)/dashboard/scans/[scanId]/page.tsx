import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import ScanDetailView from "./scan-detail-view";

interface Props {
  params: Promise<{ scanId: string }>;
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

  const { scanId } = await params;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="pb-10">
        <p className="text-sm text-muted-foreground">Scans</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Scan Detail</h1>
      </div>
      <ScanDetailView scanId={scanId} />
    </div>
  );
}
