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
      certificatePem: representativeCertificatePem,
    }),
    baseObservation(scope, "tls_config", `aws://elb/${credentials.region}/listeners`, {
      identifier: `${scope.connectorId}:aws-elb-tls-listeners:${credentials.region}`,
      observationKind: "aws_tls_listener_scope",
      region: credentials.region,
      collectionBreadth: "representative_seam",
      protocolVersion: "TLSv1.0",
      cipherSuite: "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
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

const representativeCertificatePem = `-----BEGIN CERTIFICATE-----
MIIDGTCCAgGgAwIBAgIUfENA3cWXg0pPwBZNhoiWh9J81SswDQYJKoZIhvcNAQEL
BQAwHDEaMBgGA1UEAwwRY2lwaGVyLWF0bGFzLnRlc3QwHhcNMjYwNjI5MTQwNDIx
WhcNMjYwNzI5MTQwNDIxWjAcMRowGAYDVQQDDBFjaXBoZXItYXRsYXMudGVzdDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOLqDR0u2kLetxla5s3aq/XY
aPI7aGIFTaY4z0OiF/hVGUPNHh98X9ZrwMzR4KJ2WyiW/JL1RsjCyLgUIc7WIhM3
7PlfOsMXZAfdBVr+Xpho6nES1qTr5ZzPJsmgKtQuDpcsi8nQpi5LZciSXmCQW+jD
BExsopO6mBzHuM643vCSEpUfYWewlXuXPRZ6oZqqb0iYPHMT9vBST56c+k3xGk6F
LkFaamhzhIX8U2+duYkAEVN6Wo7M9rHv/LSIc4ylUIF5eW9mqiByB16P1ER179VP
GLogemoBneRL6LG0GE3lnyuZIXI4clZ6bemn2IvD4ECgiPQMwas8d2w7Y/vny00C
AwEAAaNTMFEwHQYDVR0OBBYEFN0CewywBT9NoxMkcWRSLk2Zwvj+MB8GA1UdIwQY
MBaAFN0CewywBT9NoxMkcWRSLk2Zwvj+MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZI
hvcNAQELBQADggEBAH/h3l9+CgU4XSSRFndk5a8dwMLYFrWZ/CEQgDT9/6YI3bCJ
rXQEl7iYhkpjZAwauPiMUMLz53qKMbXcaegvrRpct6dPHDqmupL2QDy/OLwytZVG
i786uaUoXHaJ2y0tx0uF/s0pV9bVM2Otj9OlxxH6PaxhYsbUlFmVEDXh8aOUW8lF
0G75IJy2uUfadsBFgkqFNOrSVjlYR7ubD/hAde172nhCfXgAicFZbMykxUZcAlyu
cHW4Y9MvMyn8Xc6ZUm3x3uUOcMRbicDcM/UgNGAYIEvApgCy+lWyS/Uc3vGPu1nM
gre0sypKVzNbF4VoX2tFYzdAN1IPexrbB7J2LG0=
-----END CERTIFICATE-----`;
