import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

export const findingCategory = pgEnum("finding_category", ["certificate", "tls"]);

export const findingCode = pgEnum("finding_code", [
  "certificate_expired",
  "certificate_expiring_soon",
  "tls_outdated_protocol",
  "tls_weak_cipher",
]);

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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("finding_snapshot_asset_code_idx").on(table.snapshotId, table.assetId, table.code),
    index("finding_tenant_id_idx").on(table.tenantId),
    index("finding_snapshot_id_idx").on(table.snapshotId),
    index("finding_snapshot_category_idx").on(table.snapshotId, table.category),
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
