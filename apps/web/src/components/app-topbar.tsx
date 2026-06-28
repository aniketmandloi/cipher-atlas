"use client";

import { usePathname } from "next/navigation";

import { ThemeToggle } from "@cipher-atlas/ui/components/motion";
import { motion } from "motion/react";

import UserMenu from "./user-menu";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/connectors": "Connectors",
  "/dashboard/scans": "Scans",
  "/dashboard": "Dashboard",
  "/todos": "Todos",
};

function usePageTitle() {
  const pathname = usePathname();
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "";
}

const SPRING = { type: "spring" as const, stiffness: 380, damping: 32 };

interface AppTopbarProps {
  collapsed: boolean;
}

export default function AppTopbar({ collapsed }: AppTopbarProps) {
  const title = usePageTitle();

  return (
    <motion.header
      animate={{ left: collapsed ? 64 : 208 }}
      transition={SPRING}
      initial={false}
      className="fixed right-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur max-md:!left-0"
    >
      <motion.span
        key={title}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="text-sm font-medium text-foreground/80"
      >
        {title}
      </motion.span>

      <div className="flex items-center gap-3">
        <ThemeToggle
          variant="circle"
          className="h-8 w-8 rounded-full text-muted-foreground transition-colors hover:text-foreground"
          iconClassName="h-4 w-4"
        />
        <UserMenu />
      </div>
    </motion.header>
  );
}
