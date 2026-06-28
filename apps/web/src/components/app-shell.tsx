"use client";

import { useState } from "react";

import { motion } from "motion/react";

import AppSidebar from "./app-sidebar";
import AppTopbar from "./app-topbar";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 32 };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <AppTopbar collapsed={collapsed} />
      <motion.main
        animate={{ paddingLeft: collapsed ? 64 : 208 }}
        transition={SPRING}
        className="pt-14 max-md:!pl-0"
      >
        {children}
      </motion.main>
    </>
  );
}
