import PDFDocument from "pdfkit";

import type { ReportModel } from "./contracts";

export const REPORT_FINDINGS_TABLE_CAP = 50;

const FINDINGS_TABLE_CAP = REPORT_FINDINGS_TABLE_CAP;

const CATEGORY_LABELS: Record<ReportModel["findings"][number]["category"], string> = {
  certificate: "Certificates",
  tls: "TLS",
  dependency: "Dependencies",
  hndl: "HNDL",
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function shortScanId(scanId: string): string {
  return scanId.length > 8 ? scanId.slice(0, 8) : scanId;
}

function countPriorities(findings: ReportModel["findings"]): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (const finding of findings) {
    if (finding.replacementPriority === "P1") p1 += 1;
    if (finding.replacementPriority === "P2") p2 += 1;
  }
  return { p1, p2 };
}

function coverageStatusLabel(status: ReportModel["coverage"]["slices"][number]["coverageStatus"]): string {
  switch (status) {
    case "completed":
      return "Scanned";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "unsupported":
      return "Unsupported";
  }
}

export async function renderReportPdf(model: ReportModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });

    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text("Cipher Atlas", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(16).text("Cryptographic Readiness Report", { align: "center" });
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(10);
    doc.text(`Scan: ${shortScanId(model.scan.id)}`);
    doc.text(`Completed: ${formatDate(model.scan.completedAt)}`);
    doc.text(`Generated: ${formatDate(model.generatedAt)}`);
    if (model.scan.connectorScope.length > 0) {
      doc.text(`Connectors: ${model.scan.connectorScope.join(", ")}`);
    }
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Coverage");
    doc.moveDown(0.3);
    const coverageEmphasis =
      model.coverage.overall === "partial" ||
      model.coverage.overall === "failed" ||
      model.coverage.overall === "empty";
    if (coverageEmphasis) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#B45309").text(model.coverage.statement);
      doc.fillColor("#000000");
    } else {
      doc.font("Helvetica").fontSize(10).text(model.coverage.statement);
    }
    doc.moveDown(0.5);

    if (model.coverage.slices.length > 0) {
      for (const slice of model.coverage.slices) {
        const sourceLabel = slice.sourceType ?? "unknown";
        const segment = slice.segmentLabel ? ` · ${slice.segmentLabel}` : "";
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            `• ${slice.connectorDisplayName} (${sourceLabel}${segment}) — ${coverageStatusLabel(slice.coverageStatus)}`,
          );
      }
      doc.moveDown(0.8);
    }

    doc.font("Helvetica-Bold").fontSize(12).text("Executive Summary");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Total findings: ${model.summary.totalFindings}`);
    doc.text(
      `Risk breakdown — Critical: ${model.summary.riskLevelCounts.critical}, High: ${model.summary.riskLevelCounts.high}, Medium: ${model.summary.riskLevelCounts.medium}, Low: ${model.summary.riskLevelCounts.low}`,
    );
    const { p1, p2 } = countPriorities(model.findings);
    doc.text(`Replacement priority — P1: ${p1}, P2: ${p2}`);
    doc.text(`Standards-relevant findings: ${model.summary.standardsRelevantCount}`);
    doc.text(`Assets in snapshot: ${model.summary.assetCount}`);
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(12).text("Category Breakdown");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10);
    for (const [category, count] of Object.entries(model.summary.categoryCounts)) {
      doc.text(
        `${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}: ${count}`,
      );
    }
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(12).text("Prioritized Findings");
    doc.moveDown(0.3);

    if (model.findings.length === 0) {
      doc.font("Helvetica").fontSize(10).text("No findings in this snapshot.");
    } else {
      const displayed = model.findings.slice(0, FINDINGS_TABLE_CAP);
      const truncated = model.findings.length > FINDINGS_TABLE_CAP;

      if (truncated) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#666666")
          .text(`Showing first ${displayed.length} of ${model.findings.length}`);
        doc.fillColor("#000000");
        doc.moveDown(0.3);
      }

      for (const finding of displayed) {
        const nistHint =
          finding.nistMappingType === "direct"
            ? "Direct"
            : finding.nistMappingType === "interpretation"
              ? "Interpretation"
              : "—";
        const nistRef = finding.nistPrimaryReferenceId ?? "—";
        doc.font("Helvetica-Bold").fontSize(9).text(`${finding.title}`);
        doc
          .font("Helvetica")
          .fontSize(8)
          .text(
            `Risk: ${finding.riskLevel.toUpperCase()} · Priority: ${finding.replacementPriority ?? "—"} · Category: ${CATEGORY_LABELS[finding.category]}`,
          );
        doc.text(`Source: ${finding.sourceRef} · Asset: ${finding.assetIdentifier ?? "—"}`);
        doc.text(`Evidence: ${finding.evidenceLocator}`);
        doc.text(`NIST: ${nistRef} (${nistHint})`);
        doc.moveDown(0.5);
      }
    }

    doc.moveDown(1);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#666666")
      .text(
        "This report was generated from an immutable completed scan snapshot. Counts, risk levels, and priorities reflect the snapshot at publication time.",
        { align: "center" },
      );

    doc.end();
  });
}
