import { db } from "@cipher-atlas/db";
import { connector } from "@cipher-atlas/db/schema/connector";
import { finding } from "@cipher-atlas/db/schema/finding";
import { asset, scanSnapshot } from "@cipher-atlas/db/schema/inventory";
import { coverageSlice, scanAttempt, scanJob, scanJobConnector } from "@cipher-atlas/db/schema/scan";
import { env } from "@cipher-atlas/env/server";
import {
  decryptConnectorCredentials,
  deriveFindings,
  deriveScanTerminalStatus,
  launchObservationCollector,
  normalizeObservations,
  redactEvidenceText,
  type ConnectorCollectionResult,
  type CoverageSliceRecord,
  type AssetRecord,
  type Finding,
  type Observation,
  type ObservationCollector,
} from "@cipher-atlas/scan-domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

type ScanJobConnectorRow = typeof scanJobConnector.$inferSelect;
type ConnectorRow = typeof connector.$inferSelect;

export interface ProcessNextScanJobOptions {
  workerId?: string;
  failWithMessage?: string;
  failConnectorIds?: string[];
  now?: Date;
  maxClaimAttempts?: number;
  collector?: ObservationCollector;
}

const COLLECTOR_TIMEOUT_MS = 60_000;

export interface ProcessedScanJob {
  scanJobId: string;
  attemptId: string;
  status: "completed" | "failed";
}

interface ClaimedScanJob {
  scanJobId: string;
  tenantId: string;
  attemptId: string;
  claimedAt: Date;
}

export async function processNextScanJob(
  options: ProcessNextScanJobOptions = {},
): Promise<ProcessedScanJob | null> {
  const workerId = options.workerId ?? "local-worker";
  const claimedAt = options.now ?? new Date();
  const claim = await claimNextScanJob({
    workerId,
    claimedAt,
    maxAttempts: options.maxClaimAttempts ?? 3,
  });

  if (!claim) {
    return null;
  }

  let connectorRows: ScanJobConnectorRow[] = [];

  try {
    connectorRows = await db
      .select()
      .from(scanJobConnector)
      .where(eq(scanJobConnector.scanJobId, claim.scanJobId));

    const collector = options.collector ?? launchObservationCollector;
    const failConnectorIds = new Set(options.failConnectorIds ?? []);
    const jobFailMessage = options.failWithMessage
      ? sanitizeScanFailureMessage(new Error(options.failWithMessage))
      : undefined;
    const snapshotId = randomUUID();

    const collectableRows = connectorRows.filter(
      (row) => jobFailMessage === undefined && !failConnectorIds.has(row.connectorId),
    );
    const credentialRows = await loadConnectorCredentials(
      collectableRows.map((row) => row.connectorId),
      claim.tenantId,
    );

    const results = new Map<string, ConnectorCollectionResult>();

    for (const row of connectorRows) {
      if (jobFailMessage !== undefined || failConnectorIds.has(row.connectorId)) {
        results.set(row.connectorId, {
          observations: [],
          coverageStatus: "failed",
          detailMessage:
            jobFailMessage ??
            `Connector ${row.displayName} failed during scan. Re-check connector access, validate read scope, and retry the scan.`,
        });
        continue;
      }

      const credentialRow = credentialRows.get(row.connectorId);
      if (!credentialRow) {
        results.set(row.connectorId, {
          observations: [],
          coverageStatus: "failed",
          detailMessage: `Credentials for connector ${row.displayName} could not be loaded. Re-create the connector and retry the scan.`,
        });
        continue;
      }

      try {
        const decryptedCredentials = decryptConnectorCredentials(
          credentialRow.credentialCiphertext,
          env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY,
        );
        const result = await collector.collectObservations(
          {
            tenantId: claim.tenantId,
            snapshotId,
            scanJobId: claim.scanJobId,
            scanAttemptId: claim.attemptId,
            connectorId: row.connectorId,
            connectorDisplayName: row.displayName,
            sourceType: row.sourceType,
            capturedAt: options.now ?? new Date(),
          },
          decryptedCredentials,
          { signal: AbortSignal.timeout(COLLECTOR_TIMEOUT_MS) },
        );
        results.set(row.connectorId, result);
      } catch (error) {
        results.set(row.connectorId, {
          observations: [],
          coverageStatus: "failed",
          detailMessage: sanitizeScanFailureMessage(error),
        });
      }
    }

    const finishedAt = options.now ?? new Date();
    const slices = connectorRows.map((row) => {
      const result = results.get(row.connectorId);
      return buildCoverageSlice({
        claim,
        row,
        startedAt: claim.claimedAt,
        finishedAt,
        coverageStatus: result?.coverageStatus ?? "failed",
        detailMessage: result?.detailMessage ?? null,
      });
    });

    const terminalStatus = deriveScanTerminalStatus(slices);

    if (terminalStatus === "completed") {
      const observations: Observation[] = [];
      for (const row of connectorRows) {
        const result = results.get(row.connectorId);
        if (result && result.coverageStatus !== "failed") {
          observations.push(...result.observations);
        }
      }

      const assets = normalizeObservations(observations);
      const snapshotPublication: SnapshotPublication = {
        snapshotId,
        assets,
        findings: deriveFindings(assets, { now: finishedAt }),
      };
      await finalizeScanJobWithCoverage(
        claim,
        finishedAt,
        slices,
        "completed",
        undefined,
        snapshotPublication,
      );
      return { scanJobId: claim.scanJobId, attemptId: claim.attemptId, status: "completed" };
    }

    const failureMessage =
      jobFailMessage ??
      slices.find((slice) => slice.coverageStatus === "failed")?.detailMessage ??
      "Scan failed. One or more connectors could not be scanned.";
    await finalizeScanJobWithCoverage(claim, finishedAt, slices, "failed", failureMessage);
    return { scanJobId: claim.scanJobId, attemptId: claim.attemptId, status: "failed" };
  } catch (error) {
    const finishedAt = new Date();
    const failureMessage = sanitizeScanFailureMessage(error);

    if (connectorRows.length === 0) {
      await failClaimedScanJob(claim, finishedAt, failureMessage);
      return { scanJobId: claim.scanJobId, attemptId: claim.attemptId, status: "failed" };
    }

    const failedSlices = connectorRows.map((row) =>
      buildCoverageSlice({
        claim,
        row,
        startedAt: claim.claimedAt,
        finishedAt,
        coverageStatus: "failed",
        detailMessage: failureMessage,
      }),
    );

    await finalizeScanJobWithCoverage(claim, finishedAt, failedSlices, "failed", failureMessage);
    return { scanJobId: claim.scanJobId, attemptId: claim.attemptId, status: "failed" };
  }
}

async function claimNextScanJob({
  workerId,
  claimedAt,
  maxAttempts,
}: {
  workerId: string;
  claimedAt: Date;
  maxAttempts: number;
}): Promise<ClaimedScanJob | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const claimed = await db.transaction(async (tx) => {
      const [nextJob] = await tx
        .select()
        .from(scanJob)
        .where(eq(scanJob.status, "queued"))
        .orderBy(asc(scanJob.queuedAt))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!nextJob) {
        return null;
      }

      const [claimedJob] = await tx
        .update(scanJob)
        .set({ status: "running", startedAt: claimedAt, updatedAt: claimedAt })
        .where(and(eq(scanJob.id, nextJob.id), eq(scanJob.status, "queued")))
        .returning();

      if (!claimedJob) {
        return null;
      }

      const [latestAttempt] = await tx
        .select()
        .from(scanAttempt)
        .where(eq(scanAttempt.scanJobId, claimedJob.id))
        .orderBy(desc(scanAttempt.attemptNumber))
        .limit(1);
      const attemptNumber = latestAttempt ? latestAttempt.attemptNumber + 1 : 1;
      const attemptId = randomUUID();

      await tx.insert(scanAttempt).values({
        id: attemptId,
        scanJobId: claimedJob.id,
        tenantId: claimedJob.tenantId,
        attemptNumber,
        status: "running",
        workerId,
        claimedAt,
        startedAt: claimedAt,
        heartbeatAt: claimedAt,
      });

      return {
        scanJobId: claimedJob.id,
        tenantId: claimedJob.tenantId,
        attemptId,
        claimedAt,
      } satisfies ClaimedScanJob;
    });

    if (claimed) {
      return claimed;
    }
  }

  return null;
}

function buildCoverageSlice({
  claim,
  row,
  startedAt,
  finishedAt,
  coverageStatus,
  detailMessage,
}: {
  claim: ClaimedScanJob;
  row: ScanJobConnectorRow;
  startedAt: Date;
  finishedAt: Date;
  coverageStatus: "completed" | "partial" | "failed";
  detailMessage: string | null;
}): CoverageSliceRecord {
  return {
    id: randomUUID(),
    scanJobId: claim.scanJobId,
    scanAttemptId: claim.attemptId,
    tenantId: claim.tenantId,
    connectorId: row.connectorId,
    connectorDisplayName: row.displayName,
    sourceType: row.sourceType,
    segmentLabel: null,
    coverageStatus,
    detailMessage: detailMessage ? sanitizeScanFailureMessage(detailMessage) : null,
    startedAt,
    completedAt: coverageStatus === "failed" ? null : finishedAt,
    failedAt: coverageStatus === "failed" ? finishedAt : null,
    createdAt: finishedAt,
    updatedAt: finishedAt,
  };
}

async function finalizeScanJobWithCoverage(
  claim: ClaimedScanJob,
  finishedAt: Date,
  slices: CoverageSliceRecord[],
  terminalStatus: "completed" | "failed",
  failureMessage?: string,
  snapshotPublication?: SnapshotPublication,
) {
  await db.transaction(async (tx) => {
    if (snapshotPublication) {
      const [insertedSnapshot] = await tx
        .insert(scanSnapshot)
        .values({
          id: snapshotPublication.snapshotId,
          scanJobId: claim.scanJobId,
          scanAttemptId: claim.attemptId,
          tenantId: claim.tenantId,
          assetCount: snapshotPublication.assets.length,
          publishedAt: finishedAt,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        })
        .onConflictDoNothing()
        .returning({ id: scanSnapshot.id });

      if (insertedSnapshot && snapshotPublication.assets.length > 0) {
        await tx.insert(asset).values(
          snapshotPublication.assets.map((record) => ({
            id: record.id,
            snapshotId: record.snapshotId,
            scanJobId: record.scanJobId,
            tenantId: record.tenantId,
            connectorId: record.connectorId,
            connectorDisplayName: record.connectorDisplayName,
            sourceType: record.sourceType,
            assetClass: record.assetClass,
            sourceRef: record.sourceRef,
            identifier: record.identifier,
            evidence: record.evidence,
            capturedAt: record.capturedAt,
            createdAt: finishedAt,
            updatedAt: finishedAt,
          })),
        );
      }

      if (insertedSnapshot && snapshotPublication.findings.length > 0) {
        await tx
          .insert(finding)
          .values(
            snapshotPublication.findings.map((record) => ({
              id: record.id,
              snapshotId: record.snapshotId,
              scanJobId: record.scanJobId,
              scanAttemptId: record.scanAttemptId,
              tenantId: record.tenantId,
              assetId: record.assetId,
              assetClass: record.assetClass,
              category: record.category,
              code: record.code,
              title: record.title,
              rationale: record.rationale,
              sourceType: record.sourceType,
              sourceRef: record.sourceRef,
              evidence: record.evidence,
              detectedAt: record.detectedAt,
              riskLevel: record.riskLevel,
              replacementPriority: record.replacementPriority,
              nistMapping: record.nistMapping,
              createdAt: finishedAt,
              updatedAt: finishedAt,
            })),
          )
          .onConflictDoNothing({ target: [finding.snapshotId, finding.assetId, finding.code] });
      }
    }

    if (slices.length > 0) {
      await tx.insert(coverageSlice).values(
        slices.map((s) => ({
          id: s.id,
          scanJobId: s.scanJobId,
          scanAttemptId: s.scanAttemptId,
          tenantId: s.tenantId,
          connectorId: s.connectorId,
          connectorDisplayName: s.connectorDisplayName,
          sourceType: s.sourceType,
          segmentLabel: s.segmentLabel,
          coverageStatus: s.coverageStatus,
          detailMessage: s.detailMessage,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          failedAt: s.failedAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      );
    }

    await tx
      .update(scanAttempt)
      .set({
        status: terminalStatus,
        completedAt: terminalStatus === "completed" ? finishedAt : null,
        failedAt: terminalStatus === "failed" ? finishedAt : null,
        failureMessage: failureMessage ?? null,
        heartbeatAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(
        and(
          eq(scanAttempt.id, claim.attemptId),
          eq(scanAttempt.scanJobId, claim.scanJobId),
          eq(scanAttempt.tenantId, claim.tenantId),
        ),
      );

    await tx
      .update(scanJob)
      .set({
        status: terminalStatus,
        completedAt: terminalStatus === "completed" ? finishedAt : null,
        failedAt: terminalStatus === "failed" ? finishedAt : null,
        failureMessage: failureMessage ?? null,
        updatedAt: finishedAt,
      })
      .where(and(eq(scanJob.id, claim.scanJobId), eq(scanJob.tenantId, claim.tenantId)));
  });
}

interface SnapshotPublication {
  snapshotId: string;
  assets: AssetRecord[];
  findings: Finding[];
}

async function loadConnectorCredentials(
  connectorIds: string[],
  tenantId: string,
): Promise<Map<string, ConnectorRow>> {
  if (connectorIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(connector)
    .where(and(inArray(connector.id, connectorIds), eq(connector.tenantId, tenantId)));

  return new Map(rows.map((row) => [row.id, row]));
}

async function failClaimedScanJob(
  claim: ClaimedScanJob,
  finishedAt: Date,
  failureMessage: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(scanAttempt)
      .set({
        status: "failed",
        failedAt: finishedAt,
        failureMessage,
        heartbeatAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(
        and(
          eq(scanAttempt.id, claim.attemptId),
          eq(scanAttempt.scanJobId, claim.scanJobId),
          eq(scanAttempt.tenantId, claim.tenantId),
        ),
      );

    await tx
      .update(scanJob)
      .set({
        status: "failed",
        failedAt: finishedAt,
        failureMessage,
        updatedAt: finishedAt,
      })
      .where(and(eq(scanJob.id, claim.scanJobId), eq(scanJob.tenantId, claim.tenantId)));
  });
}

export function sanitizeScanFailureMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const redacted = redactEvidenceText(rawMessage).value;

  return redacted.trim().slice(0, 500) || "Scan failed.";
}

async function runWorker() {
  const once = process.argv.includes("--once");
  const workerId = process.env.CIPHER_ATLAS_WORKER_ID ?? `scan-worker-${process.pid}`;

  do {
    const result = await processNextScanJob({ workerId });
    if (result) {
      console.log(`Processed scan ${result.scanJobId} attempt ${result.attemptId}: ${result.status}`);
    } else if (once) {
      console.log("No queued scan jobs.");
    }

    if (!once) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  } while (!once);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorker().catch((error: unknown) => {
    console.error("Scan worker failed:", sanitizeScanFailureMessage(error));
    process.exit(1);
  });
}
