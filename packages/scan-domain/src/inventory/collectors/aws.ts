import {
  ACMClient,
  DescribeCertificateCommand,
  GetCertificateCommand,
  ListCertificatesCommand,
  type CertificateSummary,
} from "@aws-sdk/client-acm";
import {
  DescribeListenersCommand,
  DescribeLoadBalancersCommand,
  DescribeSSLPoliciesCommand,
  ElasticLoadBalancingV2Client,
  type Listener,
  type LoadBalancer,
  type SslPolicy,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import type { AwsCredentials } from "../../connectors";
import type { Observation } from "../../shared";
import type { ConnectorCollectionResult, ObservationCollectionScope } from "../collect";
import { baseObservation, combineSignals } from "./shared";

const MAX_CERTIFICATES = 100;
const MAX_LOAD_BALANCERS = 50;
const REQUEST_TIMEOUT_MS = 15_000;

// ListCertificates filters to a key-type subset by default — request every type explicitly.
const ACM_KEY_TYPES = [
  "RSA_1024",
  "RSA_2048",
  "RSA_3072",
  "RSA_4096",
  "EC_prime256v1",
  "EC_secp384r1",
  "EC_secp521r1",
] as const;

const WEAK_CIPHER_MARKERS = ["RC4", "3DES", "DES", "NULL", "EXPORT", "MD5"] as const;
const TLS_PROTOCOL_RANK = ["SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"] as const;

interface AwsApiClient {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
  destroy(): void;
}

export interface AwsClientConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface AwsCollectorOptions {
  signal?: AbortSignal;
  createAcmClient?: (config: AwsClientConfig) => AwsApiClient;
  createElbv2Client?: (config: AwsClientConfig) => AwsApiClient;
}

export async function collectAwsObservations(
  scope: ObservationCollectionScope,
  credentials: AwsCredentials,
  options: AwsCollectorOptions = {},
): Promise<ConnectorCollectionResult> {
  const clientConfig: AwsClientConfig = {
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
    },
  };

  const acmClient =
    options.createAcmClient?.(clientConfig) ?? (new ACMClient(clientConfig) as unknown as AwsApiClient);
  const elbClient =
    options.createElbv2Client?.(clientConfig) ??
    (new ElasticLoadBalancingV2Client(clientConfig) as unknown as AwsApiClient);

  const observations: Observation[] = [];
  const notes: string[] = [];
  let acmFailed = false;
  let elbFailed = false;

  try {
    await collectAcmCertificates(acmClient, scope, credentials.region, observations, notes, options.signal);
  } catch (error) {
    acmFailed = true;
    notes.push(describeServiceError("ACM certificate inventory", "acm:ListCertificates/GetCertificate", error));
  }

  try {
    await collectElbTlsListeners(elbClient, scope, credentials.region, observations, notes, options.signal);
  } catch (error) {
    elbFailed = true;
    notes.push(
      describeServiceError("Load balancer TLS inventory", "elasticloadbalancing:Describe*", error),
    );
  }

  acmClient.destroy();
  elbClient.destroy();

  if (acmFailed && elbFailed) {
    return { observations: [], coverageStatus: "failed", detailMessage: notes.join(" ") };
  }

  return {
    observations,
    coverageStatus: notes.length > 0 ? "partial" : "completed",
    detailMessage: notes.length > 0 ? notes.join(" ") : null,
  };
}

async function collectAcmCertificates(
  client: AwsApiClient,
  scope: ObservationCollectionScope,
  region: string,
  observations: Observation[],
  notes: string[],
  signal: AbortSignal | undefined,
): Promise<void> {
  const summaries: CertificateSummary[] = [];
  let nextToken: string | undefined;

  do {
    const response = (await client.send(
      new ListCertificatesCommand({
        Includes: { keyTypes: [...ACM_KEY_TYPES] },
        MaxItems: MAX_CERTIFICATES,
        NextToken: nextToken,
      }),
      { abortSignal: combineSignals(signal, REQUEST_TIMEOUT_MS) },
    )) as { CertificateSummaryList?: CertificateSummary[]; NextToken?: string };

    summaries.push(...(response.CertificateSummaryList ?? []));
    nextToken = response.NextToken;
  } while (nextToken && summaries.length < MAX_CERTIFICATES);

  if (summaries.length > MAX_CERTIFICATES) {
    notes.push(`Scanned the first ${MAX_CERTIFICATES} ACM certificates in ${region}.`);
  }

  for (const summary of summaries.slice(0, MAX_CERTIFICATES)) {
    const arn = summary.CertificateArn;
    if (!arn) {
      continue;
    }

    const evidence: Record<string, unknown> = {
      identifier: arn,
      region,
      ...(summary.DomainName ? { domainName: summary.DomainName } : {}),
      ...(summary.KeyAlgorithm ? { keyAlgorithm: summary.KeyAlgorithm } : {}),
      ...(summary.Status ? { certificateStatus: summary.Status } : {}),
      ...(summary.InUse !== undefined ? { inUse: summary.InUse } : {}),
      ...(summary.NotAfter ? { notAfter: summary.NotAfter.toISOString() } : {}),
    };

    try {
      const response = (await client.send(new GetCertificateCommand({ CertificateArn: arn }), {
        abortSignal: combineSignals(signal, REQUEST_TIMEOUT_MS),
      })) as { Certificate?: string };
      if (response.Certificate) {
        evidence["certificatePem"] = response.Certificate;
      }
    } catch {
      // Non-issued certificates have no exportable PEM — fall back to Describe metadata.
      try {
        const described = (await client.send(new DescribeCertificateCommand({ CertificateArn: arn }), {
          abortSignal: combineSignals(signal, REQUEST_TIMEOUT_MS),
        })) as { Certificate?: { NotAfter?: Date; Status?: string; KeyAlgorithm?: string } };
        if (described.Certificate?.NotAfter) {
          evidence["notAfter"] = described.Certificate.NotAfter.toISOString();
        }
        if (described.Certificate?.Status) {
          evidence["certificateStatus"] = described.Certificate.Status;
        }
        if (described.Certificate?.KeyAlgorithm) {
          evidence["keyAlgorithm"] = described.Certificate.KeyAlgorithm;
        }
      } catch {
        // Keep the summary-level evidence only.
      }
    }

    observations.push(baseObservation(scope, "certificate", `aws://acm/${region}/${arn}`, evidence));
  }
}

async function collectElbTlsListeners(
  client: AwsApiClient,
  scope: ObservationCollectionScope,
  region: string,
  observations: Observation[],
  notes: string[],
  signal: AbortSignal | undefined,
): Promise<void> {
  const loadBalancers: LoadBalancer[] = [];
  let marker: string | undefined;

  do {
    const response = (await client.send(new DescribeLoadBalancersCommand({ Marker: marker }), {
      abortSignal: combineSignals(signal, REQUEST_TIMEOUT_MS),
    })) as { LoadBalancers?: LoadBalancer[]; NextMarker?: string };

    loadBalancers.push(...(response.LoadBalancers ?? []));
    marker = response.NextMarker;
  } while (marker && loadBalancers.length < MAX_LOAD_BALANCERS);

  if (loadBalancers.length > MAX_LOAD_BALANCERS) {
    notes.push(`Scanned the first ${MAX_LOAD_BALANCERS} load balancers in ${region}.`);
  }

  const tlsListeners: Array<{ loadBalancer: LoadBalancer; listener: Listener }> = [];

  for (const loadBalancer of loadBalancers.slice(0, MAX_LOAD_BALANCERS)) {
    if (!loadBalancer.LoadBalancerArn) {
      continue;
    }

    const response = (await client.send(
      new DescribeListenersCommand({ LoadBalancerArn: loadBalancer.LoadBalancerArn }),
      { abortSignal: combineSignals(signal, REQUEST_TIMEOUT_MS) },
    )) as { Listeners?: Listener[] };

    for (const listener of response.Listeners ?? []) {
      if (listener.Protocol === "HTTPS" || listener.Protocol === "TLS") {
        tlsListeners.push({ loadBalancer, listener });
      }
    }
  }

  const policyNames = [
    ...new Set(
      tlsListeners
        .map(({ listener }) => listener.SslPolicy)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  const policies = new Map<string, SslPolicy>();
  if (policyNames.length > 0) {
    const response = (await client.send(new DescribeSSLPoliciesCommand({ Names: policyNames }), {
      abortSignal: combineSignals(signal, REQUEST_TIMEOUT_MS),
    })) as { SslPolicies?: SslPolicy[] };
    for (const policy of response.SslPolicies ?? []) {
      if (policy.Name) {
        policies.set(policy.Name, policy);
      }
    }
  }

  for (const { loadBalancer, listener } of tlsListeners) {
    const lbName = loadBalancer.LoadBalancerName ?? loadBalancer.LoadBalancerArn ?? "unknown-lb";
    const port = listener.Port ?? 0;
    const policy = listener.SslPolicy ? policies.get(listener.SslPolicy) : undefined;
    const protocols = policy?.SslProtocols ?? [];
    const ciphers = (policy?.Ciphers ?? [])
      .map((cipher) => cipher.Name)
      .filter((name): name is string => Boolean(name));
    const weakCipher = ciphers.find((name) =>
      WEAK_CIPHER_MARKERS.some((marker) => name.toUpperCase().includes(marker)),
    );

    observations.push(
      baseObservation(scope, "tls_config", `aws://elbv2/${region}/${lbName}/listener/${port}`, {
        identifier: `${lbName}:${listener.Protocol}:${port}`,
        region,
        loadBalancerName: lbName,
        listenerPort: port,
        ...(listener.SslPolicy ? { sslPolicy: listener.SslPolicy } : {}),
        ...(protocols.length > 0
          ? { protocolVersion: lowestTlsProtocol(protocols), protocols }
          : {}),
        ...(weakCipher
          ? { cipherSuite: weakCipher }
          : ciphers[0]
            ? { cipherSuite: ciphers[0] }
            : {}),
      }),
    );
  }
}

function lowestTlsProtocol(protocols: string[]): string {
  const ranked = [...protocols].sort((left, right) => protocolRank(left) - protocolRank(right));
  return ranked[0] ?? protocols[0] ?? "unknown";
}

function protocolRank(protocol: string): number {
  const index = TLS_PROTOCOL_RANK.findIndex((candidate) => candidate.toLowerCase() === protocol.toLowerCase());
  return index === -1 ? TLS_PROTOCOL_RANK.length : index;
}

function describeServiceError(operation: string, requiredPermissions: string, error: unknown): string {
  const name = error instanceof Error ? error.name : "";

  if (name === "AccessDeniedException" || name === "AccessDenied" || name === "UnauthorizedOperation") {
    return `${operation} was denied. Grant the connector read access (${requiredPermissions}) and retry the scan.`;
  }
  if (name === "TimeoutError" || name === "AbortError") {
    return `${operation} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Retry the scan.`;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `${operation} failed: ${detail}`;
}
