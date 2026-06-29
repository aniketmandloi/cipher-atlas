import { describe, expect, it } from "vitest";

import { deriveFindings } from "./derive";
import type { AssetRecord, EvidenceEnvelope } from "../shared";

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
          evidence: expect.objectContaining({
            certificate: expect.objectContaining({ subject: "CN=expired.example" }),
          }),
        }),
        expect.objectContaining({
          assetId: "asset-cert-expiring",
          category: "certificate",
          code: "certificate_expiring_soon",
          title: "Certificate expiring soon",
        }),
      ]),
    );
    expect(findings[0]?.rationale).toContain("asset asset-cert-");
    expect(JSON.stringify(findings)).not.toContain("ghp_1234567890abcdefghijklmnop");
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

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: "asset-tls-1",
          category: "tls",
          code: "tls_outdated_protocol",
          title: "Outdated TLS protocol",
        }),
        expect.objectContaining({
          assetId: "asset-tls-1",
          category: "tls",
          code: "tls_weak_cipher",
          title: "Weak TLS cipher",
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
    ];

    expect(JSON.stringify(deriveFindings(assets, { now }))).toBe(JSON.stringify(deriveFindings(assets, { now })));
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
    metadata: {
      token: "[redacted]",
      ...overrides.metadata,
    },
    ...overrides,
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
