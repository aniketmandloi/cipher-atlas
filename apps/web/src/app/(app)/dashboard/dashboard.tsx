"use client";

import { useState } from "react";

import { Button } from "@cipher-atlas/ui/components/motion";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";

import { authClient } from "@/lib/auth-client";

export default function Dashboard({
  customerState,
  session,
}: {
  customerState: ReturnType<typeof authClient.customer.state>;
  session: typeof authClient.$Infer.Session;
}) {
  const hasProSubscription = (customerState?.activeSubscriptions?.length ?? 0) > 0;
  const [billingPending, setBillingPending] = useState(false);

  return (
    <div className="mt-12 space-y-10">
      <ScrollReveal delay={0}>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="font-display text-2xl font-medium">
            {hasProSubscription ? "Pro" : "Free"}
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.08}>
        <Magnetic strength={0.25}>
          {hasProSubscription ? (
            <Button
              size="md"
              disabled={billingPending}
              onClick={async () => {
                setBillingPending(true);
                try { await authClient.customer.portal(); }
                finally { setBillingPending(false); }
              }}
            >
              {billingPending ? "Loading…" : "Manage Subscription"}
            </Button>
          ) : (
            <Button
              size="md"
              disabled={billingPending}
              onClick={async () => {
                setBillingPending(true);
                try { await authClient.checkout({ slug: "pro" }); }
                finally { setBillingPending(false); }
              }}
            >
              {billingPending ? "Loading…" : "Upgrade to Pro"}
            </Button>
          )}
        </Magnetic>
      </ScrollReveal>
    </div>
  );
}
