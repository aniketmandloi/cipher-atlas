import { db } from "@cipher-atlas/db";
import { scanAttempt, scanJob } from "@cipher-atlas/db/schema/scan";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export interface ProcessNextScanJobOptions {
  workerId?: string;
  failWithMessage?: string;
  now?: Date;
}

export interface ProcessedScanJob {
  scanJobId: string;
  attemptId: string;
  status: "completed" | "failed";
}

export async function processNextScanJob(
  options: ProcessNextScanJobOptions = {},
): Promise<ProcessedScanJob | null> {
  const workerId = options.workerId ?? "local-worker";
  const claimedAt = options.now ?? new Date();

  const [nextJob] = await db
    .select()
    .from(scanJob)
    .where(eq(scanJob.status, "queued"))
    .orderBy(asc(scanJob.queuedAt))
    .limit(1);

  if (!nextJob) {
    return null;
  }

  const [claimedJob] = await db
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

  const [latestAttempt] = await db
    .select()
    .from(scanAttempt)
    .where(eq(scanAttempt.scanJobId, claimedJob.id))
    .orderBy(desc(scanAttempt.attemptNumber))
    .limit(1);
  const attemptNumber = latestAttempt ? latestAttempt.attemptNumber + 1 : 1;
  const attemptId = randomUUID();

  await db.insert(scanAttempt).values({
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

  const finishedAt = new Date();
  if (options.failWithMessage) {
    const failureMessage = safeFailureMessage(options.failWithMessage);
    await db
      .update(scanAttempt)
      .set({
        status: "failed",
        failedAt: finishedAt,
        failureMessage,
        heartbeatAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(scanAttempt.id, attemptId));
    await db
      .update(scanJob)
      .set({
        status: "failed",
        failedAt: finishedAt,
        failureMessage,
        updatedAt: finishedAt,
      })
      .where(eq(scanJob.id, claimedJob.id));

    return {
      scanJobId: claimedJob.id,
      attemptId,
      status: "failed",
    };
  }

  await db
    .update(scanAttempt)
    .set({
      status: "completed",
      completedAt: finishedAt,
      heartbeatAt: finishedAt,
      updatedAt: finishedAt,
    })
    .where(eq(scanAttempt.id, attemptId));
  await db
    .update(scanJob)
    .set({
      status: "completed",
      completedAt: finishedAt,
      updatedAt: finishedAt,
    })
    .where(eq(scanJob.id, claimedJob.id));

  return {
    scanJobId: claimedJob.id,
    attemptId,
    status: "completed",
  };
}

function safeFailureMessage(message: string): string {
  return message.trim().slice(0, 500) || "Scan failed.";
}
