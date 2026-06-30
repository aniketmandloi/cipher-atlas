import { relations, sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { connectorSourceType } from "./connector";
import { asset, inventoryAssetClass, scanSnapshot } from "./inventory";

interface InventoryEvidenceEnvelope {
  sourceRef: string;
  locator: string;
  capturedAt: Date | string;
  redacted: boolean;
  redaction: {
    fields: string[];
    rulesApplied: string[];
  };
  metadata: Record<string, unknown>;
  certificate?: {
    serialNumber: string;
    subject: string;
    issuer: string;
    notBefore: Date | string;
    notAfter: Date | string;
    fingerprint: string;
  };
}

interface FindingNistMapping {
  mappingType: "direct" | "interpretation";
  references: Array<{ id: string; title: string; url?: string }>;
  summary: string;
}

export const findingCategory = pgEnum("finding_category", ["certificate", "tls", "dependency", "hndl"]);

export const findingCode = pgEnum("finding_code", [
  "certificate_expired",
  "certificate_expiring_soon",
  "tls_outdated_protocol",
  "tls_weak_cipher",
  "dependency_vulnerable_package",
  "hndl_exposure",
]);

export const findingRiskLevel = pgEnum("finding_risk_level", ["critical", "high", "medium", "low"]);

export const replacementPriority = pgEnum("replacement_priority", ["P1", "P2", "P3", "P4"]);

export const finding = pgTable(
  "finding",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => scanSnapshot.id, { onDelete: "cascade" }),
    scanJobId: text("scan_job_id").notNull(),
    scanAttemptId: text("scan_attempt_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    assetClass: inventoryAssetClass("asset_class").notNull(),
    category: findingCategory("category").notNull(),
    code: findingCode("code").notNull(),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    sourceType: connectorSourceType("source_type").notNull(),
    sourceRef: text("source_ref").notNull(),
    evidence: jsonb("evidence").$type<InventoryEvidenceEnvelope>().notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    riskLevel: findingRiskLevel("risk_level").notNull(),
    replacementPriority: replacementPriority("replacement_priority"),
    nistMapping: jsonb("nist_mapping").$type<FindingNistMapping>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("finding_snapshot_asset_code_idx").on(table.snapshotId, table.assetId, table.code),
    index("finding_tenant_id_idx").on(table.tenantId),
    index("finding_snapshot_id_idx").on(table.snapshotId),
    index("finding_snapshot_category_idx").on(table.snapshotId, table.category),
    index("finding_snapshot_risk_priority_idx").on(table.snapshotId, table.riskLevel, table.replacementPriority),
    check(
      "finding_category_code_match",
      sql`(${table.category} = 'certificate' AND ${table.code} IN ('certificate_expired', 'certificate_expiring_soon'))
          OR (${table.category} = 'tls' AND ${table.code} IN ('tls_outdated_protocol', 'tls_weak_cipher'))
          OR (${table.category} = 'dependency' AND ${table.code} IN ('dependency_vulnerable_package'))
          OR (${table.category} = 'hndl' AND ${table.code} IN ('hndl_exposure'))`,
    ),
  ],
);

export const findingRelations = relations(finding, ({ one }) => ({
  snapshot: one(scanSnapshot, {
    fields: [finding.snapshotId],
    references: [scanSnapshot.id],
  }),
  asset: one(asset, {
    fields: [finding.assetId],
    references: [asset.id],
  }),
}));
