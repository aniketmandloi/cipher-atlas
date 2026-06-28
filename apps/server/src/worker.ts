import { db } from "@cipher-atlas/db";
import { scanAttempt, scanJob } from "@cipher-atlas/db/schema/scan";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export interface ProcessNextScanJobOptions {
  workerId?: string;
  failWithMessage?: string;
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

  try {
    if (options.failWithMessage) {
      throw new Error(options.failWithMessage);
    }

    const finishedAt = new Date();
    await completeScanJob(claim, finishedAt);

    return {
      scanJobId: claim.scanJobId,
      attemptId: claim.attemptId,
      status: "completed",
    };
  } catch (error) {
    const finishedAt = new Date();
    const failureMessage = sanitizeScanFailureMessage(error);
    await failScanJob(claim, finishedAt, failureMessage);

    return {
      scanJobId: claim.scanJobId,
      attemptId: claim.attemptId,
      status: "failed",
    };
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
        .limit(1);

      if (!nextJob) {
        return null;
      }

      const [claimedJob] = await tx
        .update(scanJob)
        .set({
          status: "running",
          startedAt: claimedAt,
          updatedAt: claimedAt,
        })
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
      } satisfies ClaimedScanJob;
    });

    if (claimed) {
      return claimed;
    }
  }

  return null;
}

async function completeScanJob(claim: ClaimedScanJob, finishedAt: Date) {
  await db.transaction(async (tx) => {
    await tx
      .update(scanAttempt)
      .set({
        status: "completed",
        completedAt: finishedAt,
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
        status: "completed",
        completedAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(and(eq(scanJob.id, claim.scanJobId), eq(scanJob.tenantId, claim.tenantId)));
  });
}

async function failScanJob(claim: ClaimedScanJob, finishedAt: Date, failureMessage: string) {
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
  const redacted = rawMessage
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[redacted-token]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[redacted-access-key]")
    .replace(/ASIA[0-9A-Z]{16}/g, "[redacted-access-key]")
    .replace(
      /(?<key>secret|token|password|credential|authorization)(?<sep>\s*[:=]\s*)(?<value>[^\s,;]+)/gi,
      "$<key>$<sep>[redacted]",
    );

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
