import { describe, expect, it } from "vitest";

import type { ObservationCollectionScope } from "../collect";
import { collectAwsObservations } from "./aws";

const scope: ObservationCollectionScope = {
  tenantId: "tenant-1",
  snapshotId: "snapshot-1",
  scanJobId: "scan-1",
  scanAttemptId: "attempt-1",
  connectorId: "connector-1",
  connectorDisplayName: "AWS",
  sourceType: "aws",
  capturedAt: new Date("2026-06-29T12:00:00.000Z"),
};

const credentials = {
  accessKeyId: "AKIA1234567890ABCDEF",
  secretAccessKey: "x".repeat(40),
  region: "us-east-1",
};

const CERT_PEM = "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n";
const CERT_ARN = "arn:aws:acm:us-east-1:123456789012:certificate/abc";

interface CommandLike {
  constructor: { name: string };
  input?: unknown;
}

function fakeClient(handlers: Record<string, (input: unknown) => unknown>) {
  return {
    send: async (command: unknown) => {
      const name = (command as CommandLike).constructor.name;
      const handler = handlers[name];
      if (!handler) {
        throw new Error(`Unhandled command: ${name}`);
      }
      return handler((command as { input?: unknown }).input);
    },
    destroy: () => {},
  };
}

function accessDenied(): never {
  const error = new Error("User is not authorized to perform this action");
  error.name = "AccessDeniedException";
  throw error;
}

const workingAcm = fakeClient({
  ListCertificatesCommand: () => ({
    CertificateSummaryList: [
      {
        CertificateArn: CERT_ARN,
        DomainName: "example.com",
        KeyAlgorithm: "RSA_2048",
        Status: "ISSUED",
        InUse: true,
      },
    ],
  }),
  GetCertificateCommand: () => ({ Certificate: CERT_PEM }),
});

const workingElb = fakeClient({
  DescribeLoadBalancersCommand: () => ({
    LoadBalancers: [
      {
        LoadBalancerArn: "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/web/50d",
        LoadBalancerName: "web",
      },
    ],
  }),
  DescribeListenersCommand: () => ({
    Listeners: [
      { Protocol: "HTTPS", Port: 443, SslPolicy: "ELBSecurityPolicy-TLS-1-0-2015-04" },
      { Protocol: "HTTP", Port: 80 },
    ],
  }),
  DescribeSSLPoliciesCommand: () => ({
    SslPolicies: [
      {
        Name: "ELBSecurityPolicy-TLS-1-0-2015-04",
        SslProtocols: ["TLSv1", "TLSv1.1", "TLSv1.2"],
        Ciphers: [{ Name: "ECDHE-RSA-AES128-GCM-SHA256" }, { Name: "DES-CBC3-SHA" }],
      },
    ],
  }),
});

describe("collectAwsObservations", () => {
  it("collects ACM certificates and ELBv2 TLS listeners", async () => {
    const result = await collectAwsObservations(scope, credentials, {
      createAcmClient: () => workingAcm,
      createElbv2Client: () => workingElb,
    });

    expect(result.coverageStatus).toBe("completed");
    expect(result.detailMessage).toBeNull();

    const certificates = result.observations.filter((o) => o.assetClass === "certificate");
    expect(certificates).toHaveLength(1);
    expect(certificates[0]).toMatchObject({
      locator: `aws://acm/us-east-1/${CERT_ARN}`,
      evidence: expect.objectContaining({
        identifier: CERT_ARN,
        certificatePem: CERT_PEM,
        keyAlgorithm: "RSA_2048",
        domainName: "example.com",
      }),
    });

    const tlsConfigs = result.observations.filter((o) => o.assetClass === "tls_config");
    expect(tlsConfigs).toHaveLength(1);
    expect(tlsConfigs[0]).toMatchObject({
      locator: "aws://elbv2/us-east-1/web/listener/443",
      evidence: expect.objectContaining({
        protocolVersion: "TLSv1",
        cipherSuite: "DES-CBC3-SHA",
        sslPolicy: "ELBSecurityPolicy-TLS-1-0-2015-04",
      }),
    });
  });

  it("reports partial coverage when one service is denied", async () => {
    const result = await collectAwsObservations(scope, credentials, {
      createAcmClient: () => fakeClient({ ListCertificatesCommand: accessDenied }),
      createElbv2Client: () => workingElb,
    });

    expect(result.coverageStatus).toBe("partial");
    expect(result.detailMessage).toContain("acm:ListCertificates");
    expect(result.observations.filter((o) => o.assetClass === "tls_config")).toHaveLength(1);
    expect(result.observations.filter((o) => o.assetClass === "certificate")).toHaveLength(0);
  });

  it("fails when both services are unavailable", async () => {
    const result = await collectAwsObservations(scope, credentials, {
      createAcmClient: () => fakeClient({ ListCertificatesCommand: accessDenied }),
      createElbv2Client: () => fakeClient({ DescribeLoadBalancersCommand: accessDenied }),
    });

    expect(result.coverageStatus).toBe("failed");
    expect(result.observations).toHaveLength(0);
    expect(result.detailMessage).toContain("denied");
  });

  it("falls back to certificate metadata when the PEM is not exportable", async () => {
    const acm = fakeClient({
      ListCertificatesCommand: () => ({
        CertificateSummaryList: [{ CertificateArn: CERT_ARN, DomainName: "pending.example.com" }],
      }),
      GetCertificateCommand: () => {
        const error = new Error("Certificate is not issued");
        error.name = "RequestInProgressException";
        throw error;
      },
      DescribeCertificateCommand: () => ({
        Certificate: {
          NotAfter: new Date("2027-01-01T00:00:00.000Z"),
          Status: "PENDING_VALIDATION",
          KeyAlgorithm: "RSA_2048",
        },
      }),
    });
    const elb = fakeClient({ DescribeLoadBalancersCommand: () => ({ LoadBalancers: [] }) });

    const result = await collectAwsObservations(scope, credentials, {
      createAcmClient: () => acm,
      createElbv2Client: () => elb,
    });

    expect(result.coverageStatus).toBe("completed");
    const certificates = result.observations.filter((o) => o.assetClass === "certificate");
    expect(certificates).toHaveLength(1);
    expect(certificates[0]?.evidence).toMatchObject({
      certificateStatus: "PENDING_VALIDATION",
      keyAlgorithm: "RSA_2048",
      notAfter: "2027-01-01T00:00:00.000Z",
    });
    expect(certificates[0]?.evidence["certificatePem"]).toBeUndefined();
  });
});
