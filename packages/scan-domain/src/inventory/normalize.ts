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
  const assets: AssetRecord[] = [];
  let skipped = 0;

  for (const observation of observations) {
    try {
      assets.push(normalizeObservation(observationSchema.parse(observation)));
    } catch {
      skipped += 1;
    }
  }

  if (skipped > 0) {
    console.warn(`[scan-domain] normalizeObservations: skipped ${skipped} invalid observation(s)`);
  }

  return assets.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildEvidenceEnvelope(observation: Observation): EvidenceEnvelope {
  const redacted = redactEvidenceValue(observation.evidence);
  const metadata =
    redacted.value && typeof redacted.value === "object" && !Array.isArray(redacted.value)
      ? (redacted.value as Record<string, unknown>)
      : { value: redacted.value };
  const certResult = extractCertificateLifecycle(observation.evidence);

  // certResult === null means cert input was present but failed to parse
  const certMetadata = certResult === null ? { ...metadata, _certParseFailed: true } : metadata;

  return {
    sourceRef: observation.sourceRef,
    locator: observation.locator,
    capturedAt: observation.capturedAt,
    redacted: redacted.metadata.fields.length > 0 || redacted.metadata.rulesApplied.length > 0,
    redaction: redacted.metadata,
    metadata: certMetadata,
    ...(certResult ? { certificate: certResult } : {}),
  };
}

// Returns CertificateLifecycle on success, null if input present but parse failed, undefined if no cert input.
export function extractCertificateLifecycle(
  evidence: Record<string, unknown>,
): CertificateLifecycle | null | undefined {
  const pem = evidence["certificatePem"];
  const der = evidence["certificateDer"];

  if (typeof pem !== "string" && typeof der !== "string") {
    return undefined;
  }

  try {
    const certificate =
      typeof pem === "string"
        ? new X509Certificate(pem)
        : new X509Certificate(Buffer.from(der as string, "base64"));

    return {
      serialNumber: certificate.serialNumber,
      subject: certificate.subject,
      issuer: certificate.issuer,
      notBefore: new Date(certificate.validFrom),
      notAfter: new Date(certificate.validTo),
      fingerprint: certificate.fingerprint256,
      ...extractPublicKeyDetails(certificate),
    };
  } catch {
    return null;
  }
}

function extractPublicKeyDetails(
  certificate: X509Certificate,
): Pick<CertificateLifecycle, "keyAlgorithm" | "keySize" | "namedCurve"> {
  try {
    const publicKey = certificate.publicKey;
    const details = publicKey.asymmetricKeyDetails;

    return {
      ...(publicKey.asymmetricKeyType ? { keyAlgorithm: publicKey.asymmetricKeyType } : {}),
      ...(typeof details?.modulusLength === "number" ? { keySize: details.modulusLength } : {}),
      ...(typeof details?.namedCurve === "string" ? { namedCurve: details.namedCurve } : {}),
    };
  } catch {
    return {};
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

  // Cert input present but parse failed — hash the raw content for a unique fallback
  const pem = observation.evidence["certificatePem"];
  const der = observation.evidence["certificateDer"];
  if (typeof pem === "string" || typeof der === "string") {
    const content = typeof pem === "string" ? pem : (der as string);
    return createHash("sha256").update(content).digest("hex");
  }

  // Read identifier from the already-redacted metadata to avoid persisting raw secrets
  const redactedIdentifier = evidence.metadata["identifier"];
  if (typeof redactedIdentifier === "string" && redactedIdentifier.trim()) {
    return redactedIdentifier.trim();
  }

  return `${observation.assetClass}:${observation.sourceRef}:${observation.locator}`;
}

function stableAssetId(observation: Observation, identifier: string): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        observation.snapshotId,
        observation.connectorId,
        observation.sourceType,
        observation.assetClass,
        observation.sourceRef,
        identifier,
      ]),
    )
    .digest("hex")
    .slice(0, 32);

  return `asset_${hash}`;
}
