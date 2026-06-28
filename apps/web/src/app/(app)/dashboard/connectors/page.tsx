import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import ConnectorsView from "./connectors-view";

export default async function ConnectorsPage() {
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
      <div className="border-b border-border pb-10">
        <p className="text-sm text-muted-foreground">Connectors</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
          Source Connectors
        </h1>
      </div>
      <ConnectorsView />
    </div>
  );
}
