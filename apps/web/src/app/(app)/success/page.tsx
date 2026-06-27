import Link from "next/link";

import { buttonVariants } from "@cipher-atlas/ui/components/button";
import { cn } from "@cipher-atlas/ui/lib/utils";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_id: string }>;
}) {
  const { checkout_id } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-6 py-28 text-center">
      <p className="text-sm text-muted-foreground">Payment confirmed</p>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">
        Payment Successful
      </h1>
      {checkout_id && (
        <p className="mt-4 font-mono text-xs text-muted-foreground/60">
          ID: {checkout_id}
        </p>
      )}
      <div className="mt-10">
        <Link
          href="/dashboard"
          className={cn(buttonVariants(), "h-10 rounded-full px-5 text-sm")}
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
