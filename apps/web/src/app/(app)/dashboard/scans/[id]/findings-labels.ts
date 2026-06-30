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
