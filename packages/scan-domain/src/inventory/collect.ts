import {
  awsCredentialSchema,
  githubCredentialSchema,
  type ConnectorSourceType,
} from "../connectors";
import type { Observation } from "../shared";
import { collectAwsObservations } from "./collectors/aws";
import { collectGitHubObservations } from "./collectors/github";

export interface ObservationCollectionScope {
  tenantId: string;
  snapshotId: string;
  scanJobId: string;
  scanAttemptId: string;
  connectorId: string;
  connectorDisplayName: string;
  sourceType: ConnectorSourceType;
  capturedAt: Date;
}

export type ConnectorCoverageStatus = "completed" | "partial" | "failed";

export interface ConnectorCollectionResult {
  observations: Observation[];
  coverageStatus: ConnectorCoverageStatus;
  detailMessage: string | null;
}

export interface ObservationCollectorOptions {
  signal?: AbortSignal;
}

export interface ObservationCollector {
  collectObservations(
    connectorScope: ObservationCollectionScope,
    decryptedCredentials: unknown,
    options?: ObservationCollectorOptions,
  ): Promise<ConnectorCollectionResult>;
}

export const launchObservationCollector: ObservationCollector = {
  async collectObservations(connectorScope, decryptedCredentials, options) {
    if (connectorScope.sourceType === "github") {
      return collectGitHubObservations(
        connectorScope,
        githubCredentialSchema.parse(decryptedCredentials),
        { signal: options?.signal },
      );
    }

    if (connectorScope.sourceType === "aws") {
      return collectAwsObservations(
        connectorScope,
        awsCredentialSchema.parse(decryptedCredentials),
        { signal: options?.signal },
      );
    }

    return {
      observations: [],
      coverageStatus: "failed",
      detailMessage: `Unsupported connector source type for observation collection: ${connectorScope.sourceType satisfies never}`,
    };
  },
};
