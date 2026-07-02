import { describe, expect, it } from "vitest";

import { collectAwsObservations, type AwsCollectorOptions } from "./collectors/aws";
import { normalizeObservations } from "./normalize";
import { assetClasses, type Observation } from "../shared";

const certificatePem = `-----BEGIN CERTIFICATE-----
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

describe("normalizeObservations", () => {
  it("extracts certificate lifecycle metadata and preserves provenance", () => {
    const [asset] = normalizeObservations([
      observation({
        assetClass: "certificate",
        evidence: {
          certificatePem,
          token: "ghp_1234567890abcdefghijklmnop",
        },
      }),
    ]);

    expect(asset).toMatchObject({
      tenantId: "tenant-1",
      snapshotId: "snapshot-1",
      scanJobId: "scan-1",
      scanAttemptId: "attempt-1",
      connectorId: "connector-1",
      connectorDisplayName: "GitHub",
      sourceType: "github",
      assetClass: "certificate",
      sourceRef: "github:connector-1",
    });
    expect(asset?.identifier).toBe(asset?.evidence.certificate?.fingerprint);
    expect(asset?.evidence.certificate).toMatchObject({
      serialNumber: "7C4340DDC597834A4FC0164D86889687D27CD52B",
      subject: "CN=cipher-atlas.test",
      issuer: "CN=cipher-atlas.test",
      fingerprint: "57:EB:7E:BE:8D:92:20:4F:54:7B:F8:D4:83:BD:49:7B:E0:07:1F:E8:5C:CD:7D:BF:06:53:E3:64:84:74:9B:5E",
    });
    expect(asset?.evidence.certificate?.notBefore.toISOString()).toBe("2026-06-29T14:04:21.000Z");
    expect(asset?.evidence.certificate?.notAfter.toISOString()).toBe("2026-07-29T14:04:21.000Z");
    expect(asset?.evidence.certificate?.keyAlgorithm).toBe("rsa");
    expect(asset?.evidence.certificate?.keySize).toBe(2048);
    expect(JSON.stringify(asset?.evidence)).not.toContain("ghp_1234567890abcdefghijklmnop");
    expect(asset?.evidence.redacted).toBe(true);
  });

  it("keeps normalization deterministic for identical observations", () => {
    const observations = [
      observation({ assetClass: "dependency", locator: "github://dependency-manifests" }),
      observation({ assetClass: "hndl_signal", locator: "github://repository-signals" }),
    ];

    expect(normalizeObservations(observations)).toEqual(normalizeObservations(observations));
  });

  it("keeps the launch asset model limited to four classes", () => {
    expect(assetClasses).toEqual(["certificate", "tls_config", "dependency", "hndl_signal"]);
  });

  it("collects stable redaction-clean representative observations through the seam", async () => {
    const scope = {
      tenantId: "tenant-1",
      snapshotId: "snapshot-1",
      scanJobId: "scan-1",
      scanAttemptId: "attempt-1",
      connectorId: "connector-1",
      connectorDisplayName: "AWS",
      sourceType: "aws" as const,
      capturedAt: new Date("2026-06-29T12:00:00.000Z"),
    };
    const credentials = {
      accessKeyId: "AKIA1234567890ABCDEF",
      secretAccessKey: "x".repeat(40),
      sessionToken: "session-token",
      region: "us-east-1",
    };
    const fakeClients: AwsCollectorOptions = {
      createAcmClient: () => ({
        send: async (command: unknown) => {
          const name = (command as { constructor: { name: string } }).constructor.name;
          if (name === "ListCertificatesCommand") {
            return {
              CertificateSummaryList: [
                {
                  CertificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/abc",
                  DomainName: "example.com",
                  KeyAlgorithm: "RSA_2048",
                },
              ],
            };
          }
          if (name === "GetCertificateCommand") {
            return { Certificate: certificatePem };
          }
          throw new Error(`Unhandled command: ${name}`);
        },
        destroy: () => {},
      }),
      createElbv2Client: () => ({
        send: async () => ({ LoadBalancers: [] }),
        destroy: () => {},
      }),
    };

    const first = await collectAwsObservations(scope, credentials, fakeClients);
    const second = await collectAwsObservations(scope, credentials, fakeClients);

    expect(first).toEqual(second);
    expect(first.coverageStatus).toBe("completed");
    expect(JSON.stringify(normalizeObservations(first.observations))).not.toContain("AKIA1234567890ABCDEF");
    expect(JSON.stringify(normalizeObservations(first.observations))).not.toContain("session-token");
  });
});

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    tenantId: "tenant-1",
    snapshotId: "snapshot-1",
    scanJobId: "scan-1",
    scanAttemptId: "attempt-1",
    connectorId: "connector-1",
    connectorDisplayName: "GitHub",
    sourceType: "github",
    sourceRef: "github:connector-1",
    assetClass: "dependency",
    locator: "github://dependency-manifests",
    capturedAt: new Date("2026-06-29T12:00:00.000Z"),
    evidence: {
      identifier: "connector-1:dependency",
      path: "package.json",
    },
    ...overrides,
  };
}
