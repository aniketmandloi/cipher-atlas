"use client";

import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { cn } from "@cipher-atlas/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  const reduce = useReducedMotion();

  return (
    <div
      data-slot="skeleton"
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      {...props}
    >
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent"
          animate={{ x: ["-120%", "220%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear", repeatDelay: 0.2 }}
        />
      )}
    </div>
  );
}

export { Skeleton };
