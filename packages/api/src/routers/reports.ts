import { createHash, randomUUID } from "node:crypto";

import { db } from "@cipher-atlas/db";
import { user } from "@cipher-atlas/db/schema/auth";
import { finding } from "@cipher-atlas/db/schema/finding";
import { asset, scanSnapshot } from "@cipher-atlas/db/schema/inventory";
import { reportArtifact } from "@cipher-atlas/db/schema/report";
import { scanJob, scanJobConnector } from "@cipher-atlas/db/schema/scan";
import {
  buildReportModel,
  computeRetainedUntil,
  isWithinRetention,
  renderReportCsv,
  renderReportPdf,
  REPORT_FINDINGS_TABLE_CAP,
} from "@cipher-atlas/scan-domain";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { loadScanCoverageForAttempt } from "../lib/scan-coverage";
import { tenantScope } from "../tenant";
import { buildFacetCounts, projectEvidence } from "./findings";

const generateReportInputSchema = z.object({
  scanId: z.string().min(1),
});

const listArtifactsInputSchema = z.object({
  scanId: z.string().min(1),
});

const RETENTION_ELAPSED_MESSAGE =
  "This scan's retention window has elapsed and its report is no longer available.";

function shortScanId(scanId: string): string {
  return scanId.length > 8 ? scanId.slice(0, 8) : scanId;
}

function pdfFileName(scanId: string): string {
  return `cipher-atlas-report-${shortScanId(scanId)}.pdf`;
}

function csvFileName(scanId: string): string {
  return `cipher-atlas-findings-${shortScanId(scanId)}.csv`;
}

async function resolveCompletedScanContext(scanId: string, tenantId: string) {
  const [scanRow] = await db
    .select({
      id: scanJob.id,
      status: scanJob.status,
      completedAt: scanJob.completedAt,
    })
    .from(scanJob)
    .where(and(eq(scanJob.id, scanId), eq(scanJob.tenantId, tenantId)))
    .limit(1);

  if (!scanRow) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Scan not found",
    });
  }

  if (scanRow.status !== "completed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A report can be exported only after a scan completes.",
    });
  }

  const [snapshotRow] = await db
    .select({
      id: scanSnapshot.id,
      scanAttemptId: scanSnapshot.scanAttemptId,
      publishedAt: scanSnapshot.publishedAt,
      assetCount: scanSnapshot.assetCount,
    })
    .from(scanSnapshot)
    .where(and(eq(scanSnapshot.scanJobId, scanId), eq(scanSnapshot.tenantId, tenantId)))
    .limit(1);

  if (!snapshotRow) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Scan snapshot not found",
    });
  }

  if (!isWithinRetention(snapshotRow.publishedAt, new Date())) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: RETENTION_ELAPSED_MESSAGE,
    });
  }

  const connectorRows = await db
    .select({ displayName: scanJobConnector.displayName })
    .from(scanJobConnector)
    .where(and(eq(scanJobConnector.scanJobId, scanId), eq(scanJobConnector.tenantId, tenantId)));

  return { scanRow, snapshotRow, connectorRows };
}

async function loadReportFindingRows(
  snapshotId: string,
  tenantId: string,
  options: { limit?: number } = {},
) {
  const query = db
    .select({
      category: finding.category,
      code: finding.code,
      title: finding.title,
      riskLevel: finding.riskLevel,
      replacementPriority: finding.replacementPriority,
      sourceType: finding.sourceType,
      sourceRef: finding.sourceRef,
      evidence: finding.evidence,
      nistMapping: finding.nistMapping,
      assetIdentifier: asset.identifier,
    })
    .from(finding)
    .innerJoin(asset, eq(finding.assetId, asset.id))
    .where(and(eq(finding.snapshotId, snapshotId), eq(finding.tenantId, tenantId)))
    .orderBy(
      asc(finding.riskLevel),
      asc(finding.replacementPriority),
      asc(finding.category),
      asc(finding.code),
      asc(finding.sourceRef),
      asc(finding.id),
    );

  if (options.limit !== undefined) {
    return query.limit(options.limit);
  }

  return query;
}

async function upsertReportArtifact(input: {
  tenantId: string;
  scanJobId: string;
  snapshotId: string;
  format: "pdf" | "csv";
  byteSize: number;
  checksumSha256: string;
  generatedByUserId: string;
  generatedAt: Date;
}) {
  await db
    .insert(reportArtifact)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      scanJobId: input.scanJobId,
      snapshotId: input.snapshotId,
      format: input.format,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
      generatedByUserId: input.generatedByUserId,
      generatedAt: input.generatedAt,
    })
    .onConflictDoUpdate({
      target: [reportArtifact.snapshotId, reportArtifact.format],
      set: {
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        generatedByUserId: input.generatedByUserId,
        generatedAt: input.generatedAt,
        updatedAt: new Date(),
      },
    });
}

export const reportsRouter = router({
  generatePdf: protectedProcedure.input(generateReportInputSchema).mutation(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const { scanRow, snapshotRow, connectorRows } = await resolveCompletedScanContext(
      input.scanId,
      tenantId,
    );

    const facetRows = await db
      .select({
        category: finding.category,
        sourceType: finding.sourceType,
        assetClass: finding.assetClass,
        riskLevel: finding.riskLevel,
        nistMapping: finding.nistMapping,
      })
      .from(finding)
      .where(and(eq(finding.snapshotId, snapshotRow.id), eq(finding.tenantId, tenantId)));

    const facetCounts = buildFacetCounts(facetRows);
    const findingRows = await loadReportFindingRows(snapshotRow.id, tenantId, {
      limit: REPORT_FINDINGS_TABLE_CAP,
    });
    const coverage = await loadScanCoverageForAttempt(input.scanId, snapshotRow.scanAttemptId);
    const generatedAt = new Date();

    const reportModel = buildReportModel({
      scan: {
        id: scanRow.id,
        completedAt: scanRow.completedAt,
        connectorScope: connectorRows.map((row) => row.displayName),
      },
      snapshot: {
        id: snapshotRow.id,
        publishedAt: snapshotRow.publishedAt,
        assetCount: snapshotRow.assetCount,
      },
      coverageSummary: coverage.coverageSummary,
      coverageSlices: coverage.coverageSlices,
      summary: {
        totalFindings: facetRows.length,
        ...facetCounts,
        assetCount: snapshotRow.assetCount,
      },
      findings: findingRows.map((row) => {
        const projectedEvidence = projectEvidence(row.evidence);
        return {
          category: row.category,
          code: row.code,
          title: row.title,
          riskLevel: row.riskLevel,
          replacementPriority: row.replacementPriority,
          sourceType: row.sourceType,
          sourceRef: row.sourceRef,
          assetIdentifier: row.assetIdentifier,
          nistMapping: row.nistMapping,
          evidenceLocator: projectedEvidence.locator,
        };
      }),
      generatedAt,
    });

    const pdfBuffer = await renderReportPdf(reportModel);
    const checksumSha256 = createHash("sha256").update(pdfBuffer).digest("hex");

    await upsertReportArtifact({
      tenantId,
      scanJobId: scanRow.id,
      snapshotId: snapshotRow.id,
      format: "pdf",
      byteSize: pdfBuffer.byteLength,
      checksumSha256,
      generatedByUserId: ctx.session.user.id,
      generatedAt,
    });

    return {
      fileName: pdfFileName(scanRow.id),
      contentType: "application/pdf" as const,
      base64: pdfBuffer.toString("base64"),
    };
  }),

  generateCsv: protectedProcedure.input(generateReportInputSchema).mutation(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const { scanRow, snapshotRow, connectorRows } = await resolveCompletedScanContext(
      input.scanId,
      tenantId,
    );

    const facetRows = await db
      .select({
        category: finding.category,
        sourceType: finding.sourceType,
        assetClass: finding.assetClass,
        riskLevel: finding.riskLevel,
        nistMapping: finding.nistMapping,
      })
      .from(finding)
      .where(and(eq(finding.snapshotId, snapshotRow.id), eq(finding.tenantId, tenantId)));

    const facetCounts = buildFacetCounts(facetRows);
    const findingRows = await loadReportFindingRows(snapshotRow.id, tenantId);
    const coverage = await loadScanCoverageForAttempt(input.scanId, snapshotRow.scanAttemptId);
    const generatedAt = new Date();

    const reportModel = buildReportModel({
      scan: {
        id: scanRow.id,
        completedAt: scanRow.completedAt,
        connectorScope: connectorRows.map((row) => row.displayName),
      },
      snapshot: {
        id: snapshotRow.id,
        publishedAt: snapshotRow.publishedAt,
        assetCount: snapshotRow.assetCount,
      },
      coverageSummary: coverage.coverageSummary,
      coverageSlices: coverage.coverageSlices,
      summary: {
        totalFindings: facetRows.length,
        ...facetCounts,
        assetCount: snapshotRow.assetCount,
      },
      findings: findingRows.map((row) => {
        const projectedEvidence = projectEvidence(row.evidence);
        return {
          category: row.category,
          code: row.code,
          title: row.title,
          riskLevel: row.riskLevel,
          replacementPriority: row.replacementPriority,
          sourceType: row.sourceType,
          sourceRef: row.sourceRef,
          assetIdentifier: row.assetIdentifier,
          nistMapping: row.nistMapping,
          evidenceLocator: projectedEvidence.locator,
        };
      }),
      generatedAt,
    });

    const csvBuffer = renderReportCsv(reportModel);
    const checksumSha256 = createHash("sha256").update(csvBuffer).digest("hex");

    await upsertReportArtifact({
      tenantId,
      scanJobId: scanRow.id,
      snapshotId: snapshotRow.id,
      format: "csv",
      byteSize: csvBuffer.byteLength,
      checksumSha256,
      generatedByUserId: ctx.session.user.id,
      generatedAt,
    });

    return {
      fileName: csvFileName(scanRow.id),
      contentType: "text/csv; charset=utf-8" as const,
      base64: csvBuffer.toString("base64"),
    };
  }),

  listArtifacts: protectedProcedure.input(listArtifactsInputSchema).query(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const { snapshotRow } = await resolveCompletedScanContext(input.scanId, tenantId);
    const now = new Date();
    const snapshotRetainedUntil = computeRetainedUntil(snapshotRow.publishedAt);
    const snapshotWithinRetention = isWithinRetention(snapshotRow.publishedAt, now);

    const artifactRows = await db
      .select({
        format: reportArtifact.format,
        byteSize: reportArtifact.byteSize,
        checksumSha256: reportArtifact.checksumSha256,
        generatedAt: reportArtifact.generatedAt,
        generatedByUserId: reportArtifact.generatedByUserId,
        createdAt: reportArtifact.createdAt,
        userName: user.name,
      })
      .from(reportArtifact)
      .innerJoin(user, eq(reportArtifact.generatedByUserId, user.id))
      .where(
        and(eq(reportArtifact.snapshotId, snapshotRow.id), eq(reportArtifact.tenantId, tenantId)),
      )
      .orderBy(asc(reportArtifact.format), desc(reportArtifact.generatedAt));

    return {
      snapshot: {
        snapshotId: snapshotRow.id,
        publishedAt: snapshotRow.publishedAt,
        assetCount: snapshotRow.assetCount,
        retainedUntil: snapshotRetainedUntil,
        withinRetention: snapshotWithinRetention,
      },
      artifacts: artifactRows.map((row) => ({
        format: row.format,
        byteSize: row.byteSize,
        checksumSha256: row.checksumSha256,
        generatedAt: row.generatedAt,
        generatedByUserId: row.generatedByUserId,
        generatedByName: row.userName?.trim() || row.generatedByUserId,
        createdAt: row.createdAt,
        retainedUntil: snapshotRetainedUntil,
        withinRetention: snapshotWithinRetention,
      })),
    };
  }),
});
