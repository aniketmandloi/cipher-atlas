import type {
  AwsCredentials,
  ConnectorRecord,
  GitHubCredentials,
  RedactedConnector,
} from "./types";

export function redactConnector(connector: ConnectorRecord): RedactedConnector {
  return {
    id: connector.id,
    tenantId: connector.tenantId,
    createdByUserId: connector.createdByUserId,
    sourceType: connector.sourceType,
    displayName: connector.displayName,
    status: connector.status,
    credentialPreview: connector.credentialPreview,
    lastValidationStatus: connector.lastValidationStatus,
    lastValidationMessage: connector.lastValidationMessage,
    lastValidatedAt: connector.lastValidatedAt,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}

export function credentialPreview(
  sourceType: "github",
  credentials: GitHubCredentials,
): string;
export function credentialPreview(
  sourceType: "aws",
  credentials: AwsCredentials,
): string;
export function credentialPreview(
  sourceType: "github" | "aws",
  credentials: GitHubCredentials | AwsCredentials,
): string {
  if (sourceType === "github") {
    return lastFour((credentials as GitHubCredentials).token);
  }

  return lastFour((credentials as AwsCredentials).accessKeyId);
}

function lastFour(value: string): string {
  if (value.length < 4) return "••••";
  return `••••${value.slice(-4)}`;
}
