import { db } from "@cipher-atlas/db";
import { connector } from "@cipher-atlas/db/schema/connector";
import { scanJob, scanJobConnector } from "@cipher-atlas/db/schema/scan";
import {
  connectorScanEligibility,
  createScanInputSchema,
  getScanInputSchema,
  redactScanJob,
  type ScanConnectorScopeRecord,
  type ScanJobRecord,
} from "@cipher-atlas/scan-domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { protectedProcedure, router } from "../index";
import { tenantScope } from "../tenant";

export const scansRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const rows = await db
      .select()
      .from(scanJob)
      .where(eq(scanJob.tenantId, tenantId))
      .orderBy(desc(scanJob.createdAt));

    return hydrateScanJobs(rows);
  }),

  get: protectedProcedure.input(getScanInputSchema).query(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const [row] = await db
      .select()
      .from(scanJob)
      .where(and(eq(scanJob.id, input.id), eq(scanJob.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Scan not found",
      });
    }

    const [scan] = await hydrateScanJobs([row]);

    if (!scan) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Scan could not be loaded",
      });
    }

    return scan;
  }),

  create: protectedProcedure.input(createScanInputSchema).mutation(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const requestedConnectorIds = [...new Set(input.connectorIds)];

    const connectorRows = await db
      .select()
      .from(connector)
      .where(and(eq(connector.tenantId, tenantId), inArray(connector.id, requestedConnectorIds)));

    const foundConnectorIds = new Set(connectorRows.map((row) => row.id));
    const missingConnectorIds = requestedConnectorIds.filter((id) => !foundConnectorIds.has(id));

    if (missingConnectorIds.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "One or more selected connectors could not be found for this tenant.",
      });
    }

    const rejections = connectorRows
      .map((row) => connectorScanEligibility(row))
      .filter((result) => !result.eligible);

    if (rejections.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: rejections.map((rejection) => rejection.reason).join(" "),
      });
    }

    const jobId = randomUUID();
    const now = new Date();

    const created = await db.transaction(async (tx) => {
      const [createdJob] = await tx
        .insert(scanJob)
        .values({
          id: jobId,
          tenantId,
          createdByUserId: ctx.session.user.id,
          status: "queued",
          queuedAt: now,
        })
        .returning();

      if (!createdJob) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Scan could not be created",
        });
      }

      await tx.insert(scanJobConnector).values(
        connectorRows.map((row) => ({
          scanJobId: jobId,
          connectorId: row.id,
          tenantId,
          sourceType: row.sourceType,
          displayName: row.displayName,
          statusAtLaunch: row.status,
          selectedAt: now,
        })),
      );

      return createdJob;
    });

    const [scan] = await hydrateScanJobs([created]);

    if (!scan) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Created scan could not be loaded",
      });
    }

    return scan;
  }),
});

type ScanJobRow = typeof scanJob.$inferSelect;
type ScanConnectorRow = typeof scanJobConnector.$inferSelect;

async function hydrateScanJobs(rows: ScanJobRow[]) {
  if (rows.length === 0) {
    return [];
  }

  const scanIds = rows.map((row) => row.id);
  const scopeRows = await db
    .select()
    .from(scanJobConnector)
    .where(inArray(scanJobConnector.scanJobId, scanIds));
  const scopesByScanId = groupConnectorScopes(scopeRows);

  return rows.map((row) =>
    redactScanJob({
      id: row.id,
      tenantId: row.tenantId,
      createdByUserId: row.createdByUserId,
      status: row.status,
      failureMessage: row.failureMessage,
      queuedAt: row.queuedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      failedAt: row.failedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      connectors: scopesByScanId.get(row.id) ?? [],
    } satisfies ScanJobRecord),
  );
}

function groupConnectorScopes(rows: ScanConnectorRow[]): Map<string, ScanConnectorScopeRecord[]> {
  const scopesByScanId = new Map<string, ScanConnectorScopeRecord[]>();

  for (const row of rows) {
    const scopes = scopesByScanId.get(row.scanJobId) ?? [];
    scopes.push({
      connectorId: row.connectorId,
      tenantId: row.tenantId,
      sourceType: row.sourceType,
      displayName: row.displayName,
      statusAtLaunch: row.statusAtLaunch,
      selectedAt: row.selectedAt,
    });
    scopesByScanId.set(row.scanJobId, scopes);
  }

  return scopesByScanId;
}
