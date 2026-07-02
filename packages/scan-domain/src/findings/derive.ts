import { createHash } from "node:crypto";

import type { AssetRecord, CertificateLifecycle } from "../shared";
import type { Finding, FindingCategory, FindingCode } from "./contracts";
import { applyNistMapping } from "./nist-mapping";
import { applyPrioritization, sortFindingsByPriority } from "./prioritize";

type DerivedFindingDraft = Omit<Finding, "riskLevel" | "replacementPriority" | "nistMapping">;

export const CERTIFICATE_EXPIRING_SOON_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1_000;
const weakCipherMarkers = ["RC4", "3DES", "DES", "NULL", "EXPORT", "MD5"] as const;
const cryptographyRelevantPackages = new Set([
  "openssl",
  "libgcrypt",
  "libgcrypt20",
  "bcprov-jdk15on",
  "bouncycastle",
  "pycrypto",
  "pycryptodome",
  "cryptography",
  "libsodium",
  "sodium-native",
  "node-forge",
]);
const hndlHeuristicMarkers = [
  "long_term_confidentiality",
  "archive_encryption",
  "store_now_decrypt_later",
  "harvest_now_decrypt_later",
  "hndl_indicator",
] as const;

const findingCodeToCategory: Record<FindingCode, FindingCategory> = {
  certificate_expired: "certificate",
  certificate_expiring_soon: "certificate",
  tls_outdated_protocol: "tls",
  tls_weak_cipher: "tls",
  dependency_vulnerable_package: "dependency",
  hndl_exposure: "hndl",
  certificate_quantum_vulnerable_key: "certificate",
};

const quantumVulnerableKeyAlgorithms = ["rsa", "ec", "dsa"] as const;

export function deriveFindings(assets: AssetRecord[], context: { now: Date }): Finding[] {
  const findings: DerivedFindingDraft[] = [];

  for (const asset of assets) {
    try {
      if (asset.assetClass === "certificate") {
        findings.push(...deriveCertificateFindings(asset, context.now));
      }

      if (asset.assetClass === "tls_config") {
        findings.push(...deriveTlsFindings(asset, context.now));
      }

      if (asset.assetClass === "dependency") {
        findings.push(...deriveDependencyFindings(asset, context.now));
      }

      if (asset.assetClass === "hndl_signal") {
        findings.push(...deriveHndlFindings(asset, context.now));
      }
    } catch (err) {
      console.warn("[scan-domain] deriveFindings: skipped malformed asset", asset.id, err);
    }
  }

  return sortFindingsByPriority(
    findings.map((record) => applyNistMapping(applyPrioritization(record))),
  );
}

function deriveCertificateFindings(asset: AssetRecord, now: Date): DerivedFindingDraft[] {
  const findings: DerivedFindingDraft[] = [];
  const certificate = asset.evidence.certificate;
  const notAfter = coerceDate(certificate?.notAfter);
  const expired = certificate !== undefined && notAfter !== null && notAfter.getTime() <= now.getTime();

  if (certificate && notAfter) {
    if (expired) {
      findings.push(
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
      );
    } else if (notAfter.getTime() - now.getTime() <= CERTIFICATE_EXPIRING_SOON_WINDOW_DAYS * DAY_MS) {
      findings.push(
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
      );
    }
  }

  // Expired certificates already demand replacement — the quantum finding would only add noise.
  if (!expired) {
    const keyAlgorithm = quantumVulnerableKeyAlgorithm(asset);
    if (keyAlgorithm) {
      findings.push(
        finding(asset, {
          code: "certificate_quantum_vulnerable_key",
          title: "Quantum-vulnerable certificate key",
          rationale: quantumVulnerableKeyRationale(asset, keyAlgorithm),
          detectedAt: now,
        }),
      );
    }
  }

  return findings;
}

function quantumVulnerableKeyAlgorithm(asset: AssetRecord): string | null {
  const raw =
    asset.evidence.certificate?.keyAlgorithm ?? firstString(asset.evidence.metadata, ["keyAlgorithm"]);

  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();
  const matches = quantumVulnerableKeyAlgorithms.some(
    (algorithm) =>
      normalized === algorithm ||
      normalized.startsWith(`${algorithm}_`) ||
      normalized.startsWith(`${algorithm}-`),
  );

  return matches ? raw : null;
}

function quantumVulnerableKeyRationale(asset: AssetRecord, keyAlgorithm: string): string {
  const certificate = asset.evidence.certificate;
  const subject = certificate?.subject ?? asset.identifier ?? asset.id;
  const keySize = certificate?.keySize;
  const curve = certificate?.namedCurve;
  const keyLabel = `${keyAlgorithm.toUpperCase()}${keySize ? ` ${keySize}-bit` : ""}${curve ? ` (${curve})` : ""}`;

  return `Certificate ${subject} uses a ${keyLabel} public key, which a cryptographically relevant quantum computer can break via Shor's algorithm. Plan replacement toward NIST post-quantum standards (FIPS 203/204/205). Evidence locator: ${asset.evidence.locator}.`;
}

function deriveTlsFindings(asset: AssetRecord, now: Date): DerivedFindingDraft[] {
  const protocolVersion = firstString(asset.evidence.metadata, ["protocolVersion", "tlsVersion", "protocol"]);
  const cipherSuite = firstString(asset.evidence.metadata, ["cipherSuite", "cipher"]);
  const findings: DerivedFindingDraft[] = [];

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

function deriveDependencyFindings(asset: AssetRecord, now: Date): DerivedFindingDraft[] {
  const metadata = asset.evidence.metadata;
  const packageName = firstString(metadata, ["packageName", "package", "name"]);
  const packageVersion = firstString(metadata, ["packageVersion", "version"]);
  const vulnerabilityId = firstString(metadata, ["vulnerabilityId", "advisoryId", "cveId", "cve"]);
  const manifestSource = firstString(metadata, ["manifestSource"]);

  if (!hasVulnerablePackageExposure(packageName, packageVersion, vulnerabilityId)) {
    return [];
  }

  const packageLabel = packageName
    ? packageVersion
      ? `${packageName}@${packageVersion}`
      : packageName
    : vulnerabilityId ?? "unknown package";

  const repositoryRef = asset.sourceRef;
  const locator = asset.evidence.locator;
  const manifestLabel = manifestSource ? `manifest ${manifestSource}` : "manifest";
  const advisoryText = vulnerabilityId ? `Advisory ${vulnerabilityId} indicates` : "Launch policy flags";
  const rationale = `${advisoryText} cryptography-relevant exposure in ${packageLabel} from ${manifestLabel} in repository ${repositoryRef}. Evidence locator: ${locator}.`;

  return [
    finding(asset, {
      code: "dependency_vulnerable_package",
      title: "Vulnerable cryptography-relevant package",
      rationale,
      detectedAt: now,
    }),
  ];
}

function deriveHndlFindings(asset: AssetRecord, now: Date): DerivedFindingDraft[] {
  const metadata = asset.evidence.metadata;
  const matchedHeuristic = findMatchedHndlHeuristic(metadata);

  if (!matchedHeuristic) {
    return [];
  }

  const heuristicLabel = formatHndlHeuristicLabel(matchedHeuristic);
  const rationale = `Asset ${asset.id} flagged for harvest-now-decrypt-later risk because heuristic "${heuristicLabel}" matched. Long-lived encrypted data protected by classical cryptography may be decrypted once quantum-capable adversaries harvest ciphertext today. Evidence locator: ${asset.evidence.locator}; source: ${asset.sourceRef}.`;

  return [
    finding(asset, {
      code: "hndl_exposure",
      title: "Harvest-now-decrypt-later exposure",
      rationale,
      detectedAt: now,
    }),
  ];
}

function hasVulnerablePackageExposure(
  packageName: string | null,
  packageVersion: string | null,
  vulnerabilityId: string | null,
): boolean {
  if (!packageName || !isCryptographyRelevantPackage(packageName)) {
    return false;
  }

  if (vulnerabilityId) {
    return true;
  }

  return packageVersion !== null;
}

function isCryptographyRelevantPackage(packageName: string): boolean {
  const normalized = normalizePackageName(packageName);

  return cryptographyRelevantPackages.has(normalized);
}

function normalizePackageName(packageName: string): string {
  const lower = packageName.toLowerCase().trim();
  const segments = lower.split("/");

  return segments[segments.length - 1] ?? lower;
}

function findMatchedHndlHeuristic(metadata: Record<string, unknown>): string | null {
  const explicitMarker = firstString(metadata, ["hndlHeuristic", "hndlIndicator", "heuristic"]);
  if (explicitMarker && matchesHndlHeuristic(explicitMarker)) {
    return explicitMarker;
  }

  for (const marker of hndlHeuristicMarkers) {
    const value = metadata[marker];
    if (isTruthyMetadataValue(value)) {
      return marker;
    }
  }

  return null;
}

function matchesHndlHeuristic(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");

  return hndlHeuristicMarkers.some(
    (marker) => normalized === marker || normalized.includes(marker.replace(/_/g, "")),
  );
}

function formatHndlHeuristicLabel(heuristic: string): string {
  return heuristic.replace(/_/g, " ");
}

function isTruthyMetadataValue(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function finding(
  asset: AssetRecord,
  input: {
    code: FindingCode;
    title: string;
    rationale: string;
    detectedAt: Date;
  },
): DerivedFindingDraft {
  return {
    id: stableFindingId(asset.snapshotId, asset.id, input.code),
    snapshotId: asset.snapshotId,
    scanJobId: asset.scanJobId,
    scanAttemptId: asset.scanAttemptId,
    tenantId: asset.tenantId,
    assetId: asset.id,
    assetClass: asset.assetClass,
    category: findingCodeToCategory[input.code],
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
    normalized === "SSL3" ||
    normalized.startsWith("SSLV") ||
    normalized === "TLSV1" ||
    normalized === "TLS1" ||
    normalized === "TLSV1.0" ||
    normalized === "TLS1.0" ||
    normalized === "1.0" ||
    normalized === "TLSV1.1" ||
    normalized === "TLS1.1" ||
    normalized === "1.1"
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
