import { createHash, randomUUID } from "node:crypto";

import { db } from "@cipher-atlas/db";
import { finding } from "@cipher-atlas/db/schema/finding";
import { asset, scanSnapshot } from "@cipher-atlas/db/schema/inventory";
import { reportArtifact } from "@cipher-atlas/db/schema/report";
import { scanJob, scanJobConnector } from "@cipher-atlas/db/schema/scan";
import { buildReportModel, renderReportPdf } from "@cipher-atlas/scan-domain";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { loadScanCoverageForJob } from "../lib/scan-coverage";
import { tenantScope } from "../tenant";
import { buildFacetCounts, projectEvidence } from "./findings";

const generatePdfInputSchema = z.object({
  scanId: z.string().min(1),
});

function reportFileName(scanId: string): string {
  const shortId = scanId.length > 8 ? scanId.slice(0, 8) : scanId;
  return `cipher-atlas-report-${shortId}.pdf`;
}

export const reportsRouter = router({
  generatePdf: protectedProcedure.input(generatePdfInputSchema).mutation(async ({ ctx, input }) => {
    const tenantId = tenantScope(ctx.session.user.id);

    const [scanRow] = await db
      .select({
        id: scanJob.id,
        status: scanJob.status,
        completedAt: scanJob.completedAt,
      })
      .from(scanJob)
      .where(and(eq(scanJob.id, input.scanId), eq(scanJob.tenantId, tenantId)))
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
        publishedAt: scanSnapshot.publishedAt,
        assetCount: scanSnapshot.assetCount,
      })
      .from(scanSnapshot)
      .where(and(eq(scanSnapshot.scanJobId, input.scanId), eq(scanSnapshot.tenantId, tenantId)))
      .limit(1);

    if (!snapshotRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Scan snapshot not found",
      });
    }

    const connectorRows = await db
      .select({ displayName: scanJobConnector.displayName })
      .from(scanJobConnector)
      .where(and(eq(scanJobConnector.scanJobId, input.scanId), eq(scanJobConnector.tenantId, tenantId)));

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

    const findingRows = await db
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
      .where(and(eq(finding.snapshotId, snapshotRow.id), eq(finding.tenantId, tenantId)))
      .orderBy(
        asc(finding.riskLevel),
        asc(finding.replacementPriority),
        asc(finding.category),
        asc(finding.code),
        asc(finding.sourceRef),
        asc(finding.id),
      );

    const coverage = await loadScanCoverageForJob(input.scanId);
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
    const artifactId = randomUUID();

    await db
      .insert(reportArtifact)
      .values({
        id: artifactId,
        tenantId,
        scanJobId: scanRow.id,
        snapshotId: snapshotRow.id,
        format: "pdf",
        byteSize: pdfBuffer.byteLength,
        checksumSha256,
        generatedByUserId: ctx.session.user.id,
        generatedAt,
      })
      .onConflictDoUpdate({
        target: [reportArtifact.snapshotId, reportArtifact.format],
        set: {
          byteSize: pdfBuffer.byteLength,
          checksumSha256,
          generatedByUserId: ctx.session.user.id,
          generatedAt,
          updatedAt: new Date(),
        },
      });

    return {
      fileName: reportFileName(scanRow.id),
      contentType: "application/pdf" as const,
      base64: pdfBuffer.toString("base64"),
    };
  }),
});
