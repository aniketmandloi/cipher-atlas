import { createHash, X509Certificate } from "node:crypto";

import {
  assetClasses,
  observationSchema,
  redactEvidenceValue,
  type AssetRecord,
  type CertificateLifecycle,
  type EvidenceEnvelope,
  type Observation,
} from "../shared";

export function normalizeObservations(observations: Observation[]): AssetRecord[] {
  return observations
    .map((observation) => normalizeObservation(observationSchema.parse(observation)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildEvidenceEnvelope(observation: Observation): EvidenceEnvelope {
  const redacted = redactEvidenceValue(observation.evidence);
  const metadata =
    redacted.value && typeof redacted.value === "object" && !Array.isArray(redacted.value)
      ? (redacted.value as Record<string, unknown>)
      : { value: redacted.value };
  const certificate = extractCertificateLifecycle(observation.evidence);

  return {
    sourceRef: observation.sourceRef,
    locator: observation.locator,
    capturedAt: observation.capturedAt,
    redacted: redacted.metadata.fields.length > 0 || redacted.metadata.rulesApplied.length > 0,
    redaction: redacted.metadata,
    metadata,
    ...(certificate ? { certificate } : {}),
  };
}

export function extractCertificateLifecycle(evidence: Record<string, unknown>): CertificateLifecycle | undefined {
  const pem = evidence["certificatePem"];
  const der = evidence["certificateDer"];

  try {
    const certificate =
      typeof pem === "string"
        ? new X509Certificate(pem)
        : typeof der === "string"
          ? new X509Certificate(Buffer.from(der, "base64"))
          : undefined;

    if (!certificate) {
      return undefined;
    }

    return {
      serialNumber: certificate.serialNumber,
      subject: certificate.subject,
      issuer: certificate.issuer,
      notBefore: new Date(certificate.validFrom),
      notAfter: new Date(certificate.validTo),
      fingerprint: certificate.fingerprint256,
    };
  } catch {
    return undefined;
  }
}

function normalizeObservation(observation: Observation): AssetRecord {
  if (!assetClasses.includes(observation.assetClass)) {
    throw new Error(`Unsupported launch asset class: ${observation.assetClass}`);
  }

  const evidence = buildEvidenceEnvelope(observation);
  const identifier = deriveIdentifier(observation, evidence);

  return {
    id: stableAssetId(observation, identifier),
    snapshotId: observation.snapshotId,
    scanJobId: observation.scanJobId,
    scanAttemptId: observation.scanAttemptId,
    tenantId: observation.tenantId,
    connectorId: observation.connectorId,
    connectorDisplayName: observation.connectorDisplayName,
    sourceType: observation.sourceType,
    assetClass: observation.assetClass,
    sourceRef: observation.sourceRef,
    identifier,
    evidence,
    capturedAt: observation.capturedAt,
  };
}

function deriveIdentifier(observation: Observation, evidence: EvidenceEnvelope): string {
  if (evidence.certificate?.fingerprint) {
    return evidence.certificate.fingerprint;
  }

  const explicitIdentifier = observation.evidence["identifier"];
  if (typeof explicitIdentifier === "string" && explicitIdentifier.trim()) {
    return explicitIdentifier.trim();
  }

  return `${observation.assetClass}:${observation.sourceRef}:${observation.locator}`;
}

function stableAssetId(observation: Observation, identifier: string): string {
  const hash = createHash("sha256")
    .update(
      [
        observation.snapshotId,
        observation.connectorId,
        observation.sourceType,
        observation.assetClass,
        observation.sourceRef,
        identifier,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);

  return `asset_${hash}`;
}
