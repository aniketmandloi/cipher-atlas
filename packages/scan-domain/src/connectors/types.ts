import { z } from "zod";

export const connectorSourceTypes = ["github", "aws"] as const;
export const connectorStatuses = ["pending_validation", "usable", "invalid", "unsupported"] as const;
export const validationStatuses = ["not_validated", "valid", "invalid", "unsupported"] as const;

export const connectorSourceTypeSchema = z.enum(connectorSourceTypes);
export const connectorStatusSchema = z.enum(connectorStatuses);
export const validationStatusSchema = z.enum(validationStatuses);

export const githubCredentialSchema = z.object({
  token: z.string().min(1),
});

export const awsCredentialSchema = z.object({
  accessKeyId: z.string().min(16),
  secretAccessKey: z.string().min(20),
  sessionToken: z.string().min(1).optional(),
  region: z.string().min(1).default("us-east-1"),
});

export const connectorCredentialSchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("github"),
    credentials: githubCredentialSchema,
  }),
  z.object({
    sourceType: z.literal("aws"),
    credentials: awsCredentialSchema,
  }),
]);

export type ConnectorSourceType = (typeof connectorSourceTypes)[number];
export type ConnectorStatus = (typeof connectorStatuses)[number];
export type ValidationStatus = (typeof validationStatuses)[number];
export type GitHubCredentials = z.infer<typeof githubCredentialSchema>;
export type AwsCredentials = z.infer<typeof awsCredentialSchema>;
export type ConnectorCredentialInput = z.infer<typeof connectorCredentialSchema>;

export interface ConnectorRecord {
  id: string;
  tenantId: string;
  createdByUserId: string;
  sourceType: ConnectorSourceType;
  displayName: string;
  status: ConnectorStatus;
  credentialCiphertext: string;
  credentialPreview: string | null;
  lastValidationStatus: ValidationStatus;
  lastValidationMessage: string | null;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedactedConnector {
  id: string;
  tenantId: string;
  createdByUserId: string;
  sourceType: ConnectorSourceType;
  displayName: string;
  status: ConnectorStatus;
  credentialPreview: string | null;
  lastValidationStatus: ValidationStatus;
  lastValidationMessage: string | null;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectorValidationResult {
  status: Exclude<ValidationStatus, "not_validated">;
  connectorStatus: ConnectorStatus;
  message: string;
}
