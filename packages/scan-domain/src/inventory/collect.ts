import {
  awsCredentialSchema,
  githubCredentialSchema,
  type AwsCredentials,
  type ConnectorSourceType,
  type GitHubCredentials,
} from "../connectors";
import type { AssetClass, Observation } from "../shared";

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

export interface ObservationCollector {
  collectObservations(
    connectorScope: ObservationCollectionScope,
    decryptedCredentials: unknown,
  ): Promise<Observation[]>;
}

export const launchObservationCollector: ObservationCollector = {
  async collectObservations(connectorScope, decryptedCredentials) {
    if (connectorScope.sourceType === "github") {
      return collectGitHubObservations(connectorScope, githubCredentialSchema.parse(decryptedCredentials));
    }

    if (connectorScope.sourceType === "aws") {
      return collectAwsObservations(connectorScope, awsCredentialSchema.parse(decryptedCredentials));
    }

    throw new Error(`Unsupported connector source type for observation collection: ${connectorScope.sourceType}`);
  },
};

function collectGitHubObservations(
  scope: ObservationCollectionScope,
  _credentials: GitHubCredentials,
): Observation[] {
  return [
    baseObservation(scope, "dependency", "github://dependency-manifests", {
      identifier: `${scope.connectorId}:github-dependency-manifests`,
      observationKind: "dependency_manifest_scope",
      manifestSource: "github_repository_tree",
      collectionBreadth: "representative_seam",
    }),
    baseObservation(scope, "hndl_signal", "github://repository-signals", {
      identifier: `${scope.connectorId}:github-hndl-signals`,
      observationKind: "repository_hndl_signal_scope",
      collectionBreadth: "representative_seam",
    }),
  ];
}

function collectAwsObservations(scope: ObservationCollectionScope, credentials: AwsCredentials): Observation[] {
  return [
    baseObservation(scope, "certificate", `aws://acm/${credentials.region}/certificates`, {
      identifier: `${scope.connectorId}:aws-acm-certificates:${credentials.region}`,
      observationKind: "aws_acm_certificate_scope",
      region: credentials.region,
      collectionBreadth: "representative_seam",
    }),
    baseObservation(scope, "tls_config", `aws://elb/${credentials.region}/listeners`, {
      identifier: `${scope.connectorId}:aws-elb-tls-listeners:${credentials.region}`,
      observationKind: "aws_tls_listener_scope",
      region: credentials.region,
      collectionBreadth: "representative_seam",
    }),
    baseObservation(scope, "hndl_signal", `aws://iam/${credentials.region}/crypto-signals`, {
      identifier: `${scope.connectorId}:aws-iam-hndl-signals:${credentials.region}`,
      observationKind: "aws_hndl_signal_scope",
      region: credentials.region,
      collectionBreadth: "representative_seam",
    }),
  ];
}

function baseObservation(
  scope: ObservationCollectionScope,
  assetClass: AssetClass,
  locator: string,
  evidence: Record<string, unknown>,
): Observation {
  return {
    tenantId: scope.tenantId,
    snapshotId: scope.snapshotId,
    scanJobId: scope.scanJobId,
    scanAttemptId: scope.scanAttemptId,
    connectorId: scope.connectorId,
    connectorDisplayName: scope.connectorDisplayName,
    sourceType: scope.sourceType,
    sourceRef: `${scope.sourceType}:${scope.connectorId}`,
    assetClass,
    locator,
    capturedAt: scope.capturedAt,
    evidence,
  };
}

