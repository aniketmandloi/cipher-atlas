type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

export function categoryLabel(category: string): string {
  switch (category) {
    case "certificate":
      return "Certificate";
    case "tls":
      return "TLS";
    case "dependency":
      return "Dependency";
    case "hndl":
      return "HNDL";
    default:
      return category;
  }
}

export function assetClassLabel(assetClass: string): string {
  switch (assetClass) {
    case "certificate":
      return "Certificate";
    case "tls_config":
      return "TLS Config";
    case "dependency":
      return "Dependency";
    case "hndl_signal":
      return "HNDL Signal";
    default:
      return assetClass;
  }
}

export function riskLevelLabel(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return riskLevel;
  }
}

export function riskLevelBadgeVariant(riskLevel: string): BadgeVariant {
  switch (riskLevel) {
    case "critical":
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
    default:
      return "outline";
  }
}

export function replacementPriorityLabel(priority: string | null): string {
  if (!priority) {
    return "No replacement priority";
  }

  return priority;
}
