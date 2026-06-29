import { db } from "@cipher-atlas/db";
import { connector } from "@cipher-atlas/db/schema/connector";
import { asset, scanSnapshot } from "@cipher-atlas/db/schema/inventory";
import { coverageSlice, scanAttempt, scanJob, scanJobConnector } from "@cipher-atlas/db/schema/scan";
import { env } from "@cipher-atlas/env/server";
import {
  decryptConnectorCredentials,
  deriveScanTerminalStatus,
  launchObservationCollector,
  normalizeObservations,
  redactEvidenceText,
  type CoverageSliceRecord,
  type AssetRecord,
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
}

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

    const finishedAt = new Date();
    const failConnectorIds = new Set(options.failConnectorIds ?? []);
    const jobFailMessage = options.failWithMessage
      ? sanitizeScanFailureMessage(new Error(options.failWithMessage))
      : undefined;

    const slices = connectorRows.map((row) =>
      buildCoverageSlice({
        claim,
        row,
        startedAt: claim.claimedAt,
        finishedAt,
        shouldFail: jobFailMessage !== undefined || failConnectorIds.has(row.connectorId),
        detailMessage:
          jobFailMessage ??
          `Connector ${row.displayName} failed during scan. Re-check connector access, validate read scope, and retry the scan.`,
      }),
    );

    const terminalStatus = deriveScanTerminalStatus(slices);

    if (terminalStatus === "completed") {
      const snapshotPublication = await buildSnapshotPublication({
        claim,
        connectorRows,
        slices,
        finishedAt,
      });
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
      jobFailMessage ?? "Scan failed. One or more connectors could not be scanned.";
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
        shouldFail: true,
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
  shouldFail,
  detailMessage,
}: {
  claim: ClaimedScanJob;
  row: ScanJobConnectorRow;
  startedAt: Date;
  finishedAt: Date;
  shouldFail: boolean;
  detailMessage: string;
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
    coverageStatus: shouldFail ? "failed" : "completed",
    detailMessage: shouldFail ? sanitizeScanFailureMessage(detailMessage) : null,
    startedAt,
    completedAt: shouldFail ? null : finishedAt,
    failedAt: shouldFail ? finishedAt : null,
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
}

async function buildSnapshotPublication({
  claim,
  connectorRows,
  slices,
  finishedAt,
}: {
  claim: ClaimedScanJob;
  connectorRows: ScanJobConnectorRow[];
  slices: CoverageSliceRecord[];
  finishedAt: Date;
}): Promise<SnapshotPublication> {
  const snapshotId = randomUUID();
  const completedConnectorIds = new Set(
    slices
      .filter((slice) => slice.coverageStatus === "completed")
      .map((slice) => slice.connectorId)
      .filter((connectorId): connectorId is string => Boolean(connectorId)),
  );
  const completedConnectorRows = connectorRows.filter((row) => completedConnectorIds.has(row.connectorId));
  const credentialRows = await loadConnectorCredentials([...completedConnectorIds], claim.tenantId);
  const observations = [];

  for (const row of completedConnectorRows) {
    const credentialRow = credentialRows.get(row.connectorId);
    if (!credentialRow) {
      console.warn(`[worker] Credential row missing for connector ${row.connectorId} — skipping observation collection`);
      continue;
    }

    const decryptedCredentials = decryptConnectorCredentials(
      credentialRow.credentialCiphertext,
      env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY,
    );
    observations.push(
      ...(await launchObservationCollector.collectObservations(
        {
          tenantId: claim.tenantId,
          snapshotId,
          scanJobId: claim.scanJobId,
          scanAttemptId: claim.attemptId,
          connectorId: row.connectorId,
          connectorDisplayName: row.displayName,
          sourceType: row.sourceType,
          capturedAt: finishedAt,
        },
        decryptedCredentials,
      )),
    );
  }

  return {
    snapshotId,
    assets: normalizeObservations(observations),
  };
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
