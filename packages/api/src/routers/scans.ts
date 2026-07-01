import { db } from "@cipher-atlas/db";
import { connector } from "@cipher-atlas/db/schema/connector";
import { scanJob, scanJobConnector } from "@cipher-atlas/db/schema/scan";
import {
  connectorScanEligibility,
  createScanInputSchema,
  getScanInputSchema,
  redactScanJob,
  summarizeCoverage,
  type CoverageSummary,
  type RedactedCoverageSlice,
  type ScanConnectorScopeRecord,
  type ScanJobRecord,
} from "@cipher-atlas/scan-domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { protectedProcedure, router } from "../index";
import { loadScanCoverageForJobs } from "../lib/scan-coverage";
import { tenantScope } from "../tenant";

export const scansRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = tenantScope(ctx.session.user.id);
      const rows = await db
        .select()
        .from(scanJob)
        .where(eq(scanJob.tenantId, tenantId))
        .orderBy(desc(scanJob.createdAt), desc(scanJob.id))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return hydrateScanJobs(rows, { includeCoverageSlices: false });
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

    const [scan] = await hydrateScanJobs([row], { includeCoverageSlices: true });

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

    const [created] = await db
      .insert(scanJob)
      .values({
        id: jobId,
        tenantId,
        createdByUserId: ctx.session.user.id,
        status: "queued",
        queuedAt: now,
      })
      .returning();

    if (!created) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Scan could not be created",
      });
    }

    try {
      await db.insert(scanJobConnector).values(
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
    } catch (error) {
      await db.delete(scanJob).where(eq(scanJob.id, jobId));

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Scan could not be created",
        cause: error,
      });
    }

    const [scan] = await hydrateScanJobs([created], { includeCoverageSlices: true });

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

export interface HydratedScanJob {
  id: string;
  tenantId: string;
  createdByUserId: string;
  status: string;
  failureMessage: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  connectors: ScanConnectorScopeRecord[];
  coverageSlices?: RedactedCoverageSlice[];
  coverageSummary: CoverageSummary;
}

async function hydrateScanJobs(
  rows: ScanJobRow[],
  options: { includeCoverageSlices: boolean },
): Promise<HydratedScanJob[]> {
  if (rows.length === 0) {
    return [];
  }

  const scanIds = rows.map((row) => row.id);

  const scopeRows = await db
    .select()
    .from(scanJobConnector)
    .where(inArray(scanJobConnector.scanJobId, scanIds));

  const scopesByScanId = groupConnectorScopes(scopeRows);
  const coverageByScanId = await loadScanCoverageForJobs(scanIds);

  return rows.map((row) => {
    const redacted = redactScanJob({
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
    } satisfies ScanJobRecord);

    const coverage = coverageByScanId.get(row.id) ?? {
      coverageSlices: [],
      coverageSummary: summarizeCoverage([]),
    };

    return {
      ...redacted,
      ...(options.includeCoverageSlices ? { coverageSlices: coverage.coverageSlices } : {}),
      coverageSummary: coverage.coverageSummary,
    };
  });
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
