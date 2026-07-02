export type StatusTone = "positive" | "warning" | "info" | "negative" | "neutral";

export interface ToneBadgeProps {
  variant: "outline" | "destructive" | "secondary";
  className?: string;
}

export function toneBadgeProps(tone: StatusTone): ToneBadgeProps {
  switch (tone) {
    case "positive":
      return {
        variant: "outline",
        className:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "warning":
      return {
        variant: "outline",
        className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    case "info":
      return {
        variant: "outline",
        className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
      };
    case "negative":
      return { variant: "destructive" };
    case "neutral":
      return { variant: "secondary" };
  }
}

export const riskLevelChartColors = {
  critical: "var(--destructive)",
  high: "var(--chart-1)",
  medium: "var(--chart-4)",
  low: "var(--chart-2)",
} as const;

export const categoryChartColors = {
  certificate: "var(--chart-1)",
  tls: "var(--chart-2)",
  dependency: "var(--chart-3)",
  hndl: "var(--chart-4)",
} as const;
