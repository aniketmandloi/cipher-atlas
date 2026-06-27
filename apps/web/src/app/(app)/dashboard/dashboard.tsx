"use client";

import { Button } from "@cipher-atlas/ui/components/button";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function Dashboard({
  customerState,
  session,
}: {
  customerState: ReturnType<typeof authClient.customer.state>;
  session: typeof authClient.$Infer.Session;
}) {
  const privateData = useQuery(trpc.privateData.queryOptions());
  const hasProSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;

  return (
    <div className="mt-12 grid gap-x-12 md:grid-cols-2">
      <ScrollReveal delay={0}>
        <div className="border-t border-border pb-8 pt-6">
          <p className="text-sm text-muted-foreground">API Status</p>
          <p className="mt-2 font-display text-xl font-medium">
            {privateData.data?.message ?? "—"}
          </p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={0.08}>
        <div className="border-t border-border pb-8 pt-6">
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="mt-2 font-display text-xl font-medium">
            {hasProSubscription ? "Pro" : "Free"}
          </p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={0.16} className="md:col-span-2">
        <div className="border-t border-border pt-8">
          <Magnetic strength={0.25}>
            {hasProSubscription ? (
              <Button
                className="h-10 rounded-full px-5 text-sm"
                onClick={async () => await authClient.customer.portal()}
              >
                Manage Subscription
              </Button>
            ) : (
              <Button
                className="h-10 rounded-full px-5 text-sm"
                onClick={async () => await authClient.checkout({ slug: "pro" })}
              >
                Upgrade to Pro
              </Button>
            )}
          </Magnetic>
        </div>
      </ScrollReveal>
    </div>
  );
}
