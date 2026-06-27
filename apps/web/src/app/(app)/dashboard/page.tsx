import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  const { data: customerState } = await authClient.customer.state({
    fetchOptions: {
      headers: await headers(),
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="border-b border-border pb-10">
        <p className="text-sm text-muted-foreground">Dashboard</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">
          Welcome back, {session.user.name}
        </h1>
      </div>
      <Dashboard session={session} customerState={customerState} />
    </div>
  );
}
