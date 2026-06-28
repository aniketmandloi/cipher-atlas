"use client";

import type Link from "next/link";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { Magnetic, ScrollProgress } from "@cipher-atlas/ui/components/motion";
import { cn } from "@cipher-atlas/ui/lib/utils";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

type Href = Parameters<typeof Link>[0]["href"];

const brand = { name: "Cipher Atlas", mark: "CA" } as const;

const links = [
  { to: "/dashboard" as Href, label: "Dashboard" },
  { to: "/dashboard/connectors" as Href, label: "Connectors" },
  { to: "/todos" as Href, label: "Todos" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <ScrollProgress fixed={false} className="absolute bottom-0 left-0 right-0 top-auto" />
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Magnetic strength={0.15}>
          <NextLink
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <span className="grid size-6 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">
              {brand.mark}
            </span>
            {brand.name}
          </NextLink>
        </Magnetic>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {links.map(({ to, label }) => (
            <Magnetic key={String(to)} strength={0.2}>
              <NextLink
                href={to}
                aria-current={pathname === String(to) ? "page" : undefined}
                className={cn(
                  "transition-colors hover:text-foreground",
                  pathname === String(to) && "text-foreground",
                )}
              >
                {label}
              </NextLink>
            </Magnetic>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
