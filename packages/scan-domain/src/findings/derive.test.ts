import { describe, expect, it } from "vitest";

import { normalizeObservations } from "../inventory/normalize";
import { deriveFindings } from "./derive";
import type { AssetRecord, EvidenceEnvelope, Observation } from "../shared";

const SECRET_FIXTURE = "ghp_1234567890abcdefghijklmnop";

describe("deriveFindings", () => {
  it("derives certificate findings with stable evidence and rationale", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const findings = deriveFindings(
      [
        asset({
          id: "asset-cert-expired",
          assetClass: "certificate",
          evidence: evidence({
            certificate: certificate({ subject: "CN=expired.example", notAfter: new Date("2026-06-01T00:00:00.000Z") }),
          }),
        }),
        asset({
          id: "asset-cert-expiring",
          assetClass: "certificate",
          evidence: evidence({
            certificate: certificate({ subject: "CN=soon.example", notAfter: new Date("2026-07-20T00:00:00.000Z") }),
          }),
        }),
      ],
      { now },
    );

    expect(findings).toHaveLength(2);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^finding_[a-f0-9]{32}$/),
          assetId: "asset-cert-expired",
          category: "certificate",
          code: "certificate_expired",
          title: "Certificate expired",
          riskLevel: "high",
          replacementPriority: "P1",
          evidence: expect.objectContaining({
            certificate: expect.objectContaining({ subject: "CN=expired.example" }),
          }),
        }),
        expect.objectContaining({
          assetId: "asset-cert-expiring",
          category: "certificate",
          code: "certificate_expiring_soon",
          title: "Certificate expiring soon",
          riskLevel: "medium",
          replacementPriority: "P3",
        }),
      ]),
    );
    expect(findings[0]?.rationale).toContain("asset asset-cert-");
    expect(JSON.stringify(findings)).not.toContain(SECRET_FIXTURE);
  });

  it("derives TLS findings from outdated protocol and weak cipher posture", () => {
    const findings = deriveFindings(
      [
        asset({
          id: "asset-tls-1",
          assetClass: "tls_config",
          evidence: evidence({
            metadata: {
              protocolVersion: "TLSv1.0",
              cipherSuite: "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
            },
          }),
        }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toHaveLength(2);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: "asset-tls-1",
          category: "tls",
          code: "tls_outdated_protocol",
          title: "Outdated TLS protocol",
          riskLevel: "high",
          replacementPriority: "P2",
        }),
        expect.objectContaining({
          assetId: "asset-tls-1",
          category: "tls",
          code: "tls_weak_cipher",
          title: "Weak TLS cipher",
          riskLevel: "medium",
          replacementPriority: "P3",
        }),
      ]),
    );
    expect(findings.every((finding) => finding.evidence.metadata["protocolVersion"] === "TLSv1.0")).toBe(true);
  });

  it("skips unsupported or incomplete assets without throwing", () => {
    const findings = deriveFindings(
      [
        asset({ id: "asset-cert-empty", assetClass: "certificate", evidence: evidence() }),
        asset({ id: "asset-tls-empty", assetClass: "tls_config", evidence: evidence() }),
        asset({ id: "asset-dep", assetClass: "dependency", evidence: evidence() }),
        asset({ id: "asset-hndl", assetClass: "hndl_signal", evidence: evidence() }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toEqual([]);
  });

  it("derives dependency findings for launch-relevant vulnerable package markers", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const [normalizedAsset] = normalizeObservations([
      dependencyObservation({
        sourceRef: "github:connector-repo",
        evidence: {
          packageName: "openssl",
          packageVersion: "1.1.1k",
          manifestSource: "package-lock.json",
          token: SECRET_FIXTURE,
        },
      }),
    ]);
    const findings = deriveFindings([normalizedAsset!], { now });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual(
      expect.objectContaining({
        assetId: normalizedAsset?.id,
        category: "dependency",
        code: "dependency_vulnerable_package",
        title: "Vulnerable cryptography-relevant package",
        riskLevel: "high",
        replacementPriority: "P2",
        sourceRef: "github:connector-repo",
        sourceType: "github",
      }),
    );
    expect(findings[0]?.rationale).toContain("openssl@1.1.1k");
    expect(findings[0]?.rationale).toContain("manifest package-lock.json");
    expect(findings[0]?.rationale).toContain("repository github:connector-repo");
    expect(JSON.stringify(findings)).not.toContain(SECRET_FIXTURE);
  });

  it("skips dependency assets with package markers but no version or advisory", () => {
    const findings = deriveFindings(
      [
        asset({
          id: "asset-dep-no-version",
          assetClass: "dependency",
          evidence: evidence({
            metadata: {
              packageName: "openssl",
              manifestSource: "package-lock.json",
            },
          }),
        }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toEqual([]);
  });

  it("derives HNDL findings when a launch heuristic marker is present", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const findings = deriveFindings(
      [
        asset({
          id: "asset-hndl-hit",
          assetClass: "hndl_signal",
          sourceRef: "aws:connector-1",
          evidence: evidence({
            locator: "aws://hndl-signals",
            metadata: {
              long_term_confidentiality: true,
              region: "us-east-1",
            },
          }),
        }),
      ],
      { now },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual(
      expect.objectContaining({
        assetId: "asset-hndl-hit",
        category: "hndl",
        code: "hndl_exposure",
        title: "Harvest-now-decrypt-later exposure",
        riskLevel: "critical",
        replacementPriority: "P1",
      }),
    );
    expect(findings[0]?.rationale).toContain("long term confidentiality");
    expect(findings[0]?.rationale).toContain("harvest-now-decrypt-later");
  });

  it("derives HNDL findings from padded or differently-cased true string markers", () => {
    const findings = deriveFindings(
      [
        asset({
          id: "asset-hndl-string",
          assetClass: "hndl_signal",
          evidence: evidence({
            metadata: {
              archive_encryption: " True ",
            },
          }),
        }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("hndl_exposure");
    expect(findings[0]?.rationale).toContain("archive encryption");
  });

  it("derives dependency findings from explicit vulnerability identifiers on crypto packages", () => {
    const findings = deriveFindings(
      [
        asset({
          id: "asset-dep-cve",
          assetClass: "dependency",
          evidence: evidence({
            metadata: {
              packageName: "cryptography",
              vulnerabilityId: "CVE-2024-1234",
              manifestSource: "requirements.txt",
            },
          }),
        }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("dependency_vulnerable_package");
    expect(findings[0]?.rationale).toContain("CVE-2024-1234");
    expect(findings[0]?.rationale).toContain("manifest requirements.txt");
  });

  it("skips dependency findings for unrelated packages even with advisory metadata", () => {
    const findings = deriveFindings(
      [
        asset({
          id: "asset-dep-unrelated",
          assetClass: "dependency",
          evidence: evidence({
            metadata: {
              packageName: "lodash",
              packageVersion: "4.17.21",
              vulnerabilityId: "CVE-2024-1234",
            },
          }),
        }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toEqual([]);
  });

  it("skips dependency findings for substring crypto false positives", () => {
    const findings = deriveFindings(
      [
        asset({
          id: "asset-dep-false-positive",
          assetClass: "dependency",
          evidence: evidence({
            metadata: {
              packageName: "my-rsa-utils",
              packageVersion: "1.0.0",
            },
          }),
        }),
      ],
      { now: new Date("2026-06-29T12:00:00.000Z") },
    );

    expect(findings).toEqual([]);
  });

  it("returns byte-identical output for the same assets and clock", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const assets = [
      asset({
        id: "asset-tls-1",
        assetClass: "tls_config",
        evidence: evidence({ metadata: { protocolVersion: "TLSv1.1" } }),
      }),
      asset({
        id: "asset-dep-1",
        assetClass: "dependency",
        evidence: evidence({ metadata: { packageName: "openssl", packageVersion: "3.0.0" } }),
      }),
    ];

    const first = deriveFindings(assets, { now });
    const second = deriveFindings(assets, { now });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.map((item) => [item.riskLevel, item.replacementPriority])).toEqual([
      ["high", "P2"],
      ["high", "P2"],
    ]);
  });

  it("finding ids are stable regardless of the clock value passed and exclude risk/priority", () => {
    const assets = [
      asset({
        id: "asset-tls-stable",
        assetClass: "tls_config",
        evidence: evidence({ metadata: { protocolVersion: "TLSv1.0" } }),
      }),
      asset({
        id: "asset-hndl-stable",
        assetClass: "hndl_signal",
        evidence: evidence({ metadata: { hndlHeuristic: "archive_encryption" } }),
      }),
    ];

    const ids1 = deriveFindings(assets, { now: new Date("2026-01-01T00:00:00.000Z") }).map((f) => f.id);
    const ids2 = deriveFindings(assets, { now: new Date("2026-12-31T23:59:59.000Z") }).map((f) => f.id);

    expect(ids1).toEqual(ids2);
    for (const id of ids1) {
      expect(id).not.toMatch(/critical|high|medium|low|P1|P2|P3/);
    }
  });
});

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "asset-1",
    snapshotId: "snapshot-1",
    scanJobId: "scan-1",
    scanAttemptId: "attempt-1",
    tenantId: "tenant-1",
    connectorId: "connector-1",
    connectorDisplayName: "Connector",
    sourceType: "aws",
    assetClass: "certificate",
    sourceRef: "aws:connector-1",
    identifier: "identifier-1",
    evidence: evidence(),
    capturedAt: new Date("2026-06-29T12:00:00.000Z"),
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return {
    sourceRef: "aws:connector-1",
    locator: "aws://resource",
    capturedAt: new Date("2026-06-29T12:00:00.000Z"),
    redacted: true,
    redaction: {
      fields: ["token"],
      rulesApplied: ["secret-pattern"],
    },
    ...overrides,
    metadata: {
      token: "[redacted]",
      ...overrides.metadata,
    },
  };
}

function certificate(overrides: Partial<EvidenceEnvelope["certificate"]> = {}): NonNullable<EvidenceEnvelope["certificate"]> {
  return {
    serialNumber: "ABC123",
    subject: "CN=example.test",
    issuer: "CN=issuer.test",
    notBefore: new Date("2026-01-01T00:00:00.000Z"),
    notAfter: new Date("2026-07-01T00:00:00.000Z"),
    fingerprint: "AA:BB:CC",
    ...overrides,
  };
}

function dependencyObservation(overrides: Partial<Observation> = {}): Observation {
  const { evidence: evidenceOverrides, ...restOverrides } = overrides;

  return {
    tenantId: "tenant-1",
    snapshotId: "snapshot-1",
    scanJobId: "scan-1",
    scanAttemptId: "attempt-1",
    connectorId: "connector-1",
    connectorDisplayName: "GitHub",
    sourceType: "github",
    sourceRef: "github:connector-repo",
    assetClass: "dependency",
    locator: "github://dependency-manifests",
    capturedAt: new Date("2026-06-29T12:00:00.000Z"),
    evidence: {
      identifier: "connector-1:dependency",
      ...evidenceOverrides,
    },
    ...restOverrides,
  };
}
