"use client";

import type Link from "next/link";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { Magnetic } from "@cipher-atlas/ui/components/motion";
import { cn } from "@cipher-atlas/ui/lib/utils";
import { Cable, ChevronLeft, LayoutDashboard, ListTodo } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type Href = Parameters<typeof Link>[0]["href"];

const brand = { name: "Cipher Atlas", mark: "CA" } as const;

const links = [
  { to: "/dashboard" as Href, label: "Dashboard", Icon: LayoutDashboard },
  { to: "/dashboard/connectors" as Href, label: "Connectors", Icon: Cable },
  { to: "/todos" as Href, label: "Todos", Icon: ListTodo },
];

const SPRING = { type: "spring" as const, stiffness: 380, damping: 32 };

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 208 }}
      transition={SPRING}
      className="fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden border-r border-border bg-background py-6"
    >
      {/* Brand */}
      <div className={cn("px-4", collapsed && "flex justify-center px-0")}>
        <Magnetic strength={0.15}>
          <NextLink
            href="/"
            className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">
              {brand.mark}
            </span>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {brand.name}
                </motion.span>
              )}
            </AnimatePresence>
          </NextLink>
        </Magnetic>
      </div>

      {/* Nav */}
      <nav className="relative mt-10 flex flex-col gap-0.5 px-2">
        {links.map(({ to, label, Icon }, i) => {
          const active =
            pathname === String(to) ||
            (String(to) !== "/dashboard" && pathname.startsWith(String(to)));
          return (
            <motion.div
              key={String(to)}
              className="relative"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 + i * 0.055, ease: "easeOut" }}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-md bg-foreground/8"
                  transition={SPRING}
                />
              )}
              <NextLink
                href={to}
                title={collapsed ? label : undefined}
                className={cn(
                  "relative z-10 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                  collapsed && "justify-center",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NextLink>
            </motion.div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={cn("mt-auto px-2", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={SPRING}>
            <ChevronLeft className="size-4" />
          </motion.div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden whitespace-nowrap text-xs"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
