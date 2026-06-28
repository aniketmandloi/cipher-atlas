import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import ScansView from "./scans-view";

export default async function ScansPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="pb-10">
        <p className="text-sm text-muted-foreground">Scans</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Scan Jobs</h1>
      </div>
      <ScansView />
    </div>
  );
}
