import { createHash } from "node:crypto";

import type { AssetRecord, CertificateLifecycle } from "../shared";
import type { Finding, FindingCode } from "./contracts";

export const CERTIFICATE_EXPIRING_SOON_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1_000;
const weakCipherMarkers = ["RC4", "3DES", "DES", "NULL", "EXPORT", "MD5", "_CBC_"] as const;

export function deriveFindings(assets: AssetRecord[], context: { now: Date }): Finding[] {
  const findings: Finding[] = [];

  for (const asset of assets) {
    try {
      if (asset.assetClass === "certificate") {
        findings.push(...deriveCertificateFindings(asset, context.now));
      }

      if (asset.assetClass === "tls_config") {
        findings.push(...deriveTlsFindings(asset, context.now));
      }
    } catch {
      // Malformed individual assets should not fail publication for an otherwise completed scan.
    }
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

function deriveCertificateFindings(asset: AssetRecord, now: Date): Finding[] {
  const certificate = asset.evidence.certificate;
  const notAfter = coerceDate(certificate?.notAfter);

  if (!certificate || !notAfter) {
    return [];
  }

  if (notAfter.getTime() < now.getTime()) {
    return [
      finding(asset, {
        code: "certificate_expired",
        title: "Certificate expired",
        rationale: certificateRationale(
          asset,
          certificate,
          notAfter,
          `expired on ${formatDate(notAfter)}`,
        ),
        detectedAt: now,
      }),
    ];
  }

  const expiresInMs = notAfter.getTime() - now.getTime();
  if (expiresInMs <= CERTIFICATE_EXPIRING_SOON_WINDOW_DAYS * DAY_MS) {
    return [
      finding(asset, {
        code: "certificate_expiring_soon",
        title: "Certificate expiring soon",
        rationale: certificateRationale(
          asset,
          certificate,
          notAfter,
          `expires within ${CERTIFICATE_EXPIRING_SOON_WINDOW_DAYS} days on ${formatDate(notAfter)}`,
        ),
        detectedAt: now,
      }),
    ];
  }

  return [];
}

function deriveTlsFindings(asset: AssetRecord, now: Date): Finding[] {
  const protocolVersion = firstString(asset.evidence.metadata, ["protocolVersion", "tlsVersion", "protocol"]);
  const cipherSuite = firstString(asset.evidence.metadata, ["cipherSuite", "cipher"]);
  const findings: Finding[] = [];

  if (protocolVersion && isOutdatedTlsProtocol(protocolVersion)) {
    findings.push(
      finding(asset, {
        code: "tls_outdated_protocol",
        title: "Outdated TLS protocol",
        rationale: `Asset ${asset.id} uses ${protocolVersion}, which is below the launch minimum of TLS 1.2. Evidence locator: ${asset.evidence.locator}.`,
        detectedAt: now,
      }),
    );
  }

  if (cipherSuite && isWeakCipher(cipherSuite)) {
    findings.push(
      finding(asset, {
        code: "tls_weak_cipher",
        title: "Weak TLS cipher",
        rationale: `Asset ${asset.id} advertises weak cipher suite ${cipherSuite}. Evidence locator: ${asset.evidence.locator}.`,
        detectedAt: now,
      }),
    );
  }

  return findings;
}

function finding(
  asset: AssetRecord,
  input: {
    code: FindingCode;
    title: string;
    rationale: string;
    detectedAt: Date;
  },
): Finding {
  return {
    id: stableFindingId(asset.snapshotId, asset.id, input.code),
    snapshotId: asset.snapshotId,
    scanJobId: asset.scanJobId,
    scanAttemptId: asset.scanAttemptId,
    tenantId: asset.tenantId,
    assetId: asset.id,
    assetClass: asset.assetClass,
    category: input.code.startsWith("certificate_") ? "certificate" : "tls",
    code: input.code,
    title: input.title,
    rationale: input.rationale,
    sourceType: asset.sourceType,
    sourceRef: asset.sourceRef,
    evidence: asset.evidence,
    detectedAt: input.detectedAt,
  };
}

function certificateRationale(
  asset: AssetRecord,
  certificate: CertificateLifecycle,
  notAfter: Date,
  expiryText: string,
): string {
  return `Certificate ${certificate.subject} for asset ${asset.id} ${expiryText}. Evidence locator: ${asset.evidence.locator}; fingerprint: ${certificate.fingerprint}; notAfter: ${formatDate(notAfter)}.`;
}

function coerceDate(value: Date | string | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function firstString(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isOutdatedTlsProtocol(protocolVersion: string): boolean {
  const normalized = protocolVersion.toUpperCase().replace(/\s+/g, "");

  return (
    normalized === "SSL" ||
    normalized.startsWith("SSLV") ||
    normalized === "TLSV1" ||
    normalized === "TLS1" ||
    normalized === "TLSV1.0" ||
    normalized === "TLS1.0" ||
    normalized === "TLSV1.1" ||
    normalized === "TLS1.1"
  );
}

function isWeakCipher(cipherSuite: string): boolean {
  const normalized = cipherSuite.toUpperCase();

  return weakCipherMarkers.some((marker) => normalized.includes(marker));
}

function stableFindingId(snapshotId: string, assetId: string, code: FindingCode): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([snapshotId, assetId, code]))
    .digest("hex")
    .slice(0, 32);

  return `finding_${hash}`;
}

function formatDate(date: Date): string {
  return date.toISOString();
}
