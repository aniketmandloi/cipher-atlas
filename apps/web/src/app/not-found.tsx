"use client";

import { NotFoundGlitch } from "@cipher-atlas/ui/components/motion/not-found";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <NotFoundGlitch
        description="This page moved, vanished, or never existed. Your scans are safe."
        homeHref="/dashboard"
        homeLabel="Back to dashboard"
        browseHref="/"
        browseLabel="Go to home"
      />
    </main>
  );
}
