import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { connector, connectorSourceType } from "./connector";
import { scanAttempt, scanJob } from "./scan";

// Date fields are stored as ISO strings in jsonb and returned as strings on read.
// Using Date | string accurately reflects both the write-time and read-time shapes.
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

export const inventoryAssetClass = pgEnum("inventory_asset_class", [
  "certificate",
  "tls_config",
  "dependency",
  "hndl_signal",
]);

export const scanSnapshot = pgTable(
  "scan_snapshot",
  {
    id: text("id").primaryKey(),
    scanJobId: text("scan_job_id")
      .notNull()
      .references(() => scanJob.id, { onDelete: "cascade" }),
    scanAttemptId: text("scan_attempt_id")
      .notNull()
      .references(() => scanAttempt.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    assetCount: integer("asset_count").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("scan_snapshot_scan_job_id_idx").on(table.scanJobId),
    index("scan_snapshot_tenant_id_idx").on(table.tenantId),
  ],
);

export const asset = pgTable(
  "asset",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => scanSnapshot.id, { onDelete: "cascade" }),
    scanJobId: text("scan_job_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    connectorId: text("connector_id").references(() => connector.id, { onDelete: "set null" }),
    connectorDisplayName: text("connector_display_name").notNull(),
    sourceType: connectorSourceType("source_type").notNull(),
    assetClass: inventoryAssetClass("asset_class").notNull(),
    sourceRef: text("source_ref").notNull(),
    identifier: text("identifier"),
    evidence: jsonb("evidence").$type<InventoryEvidenceEnvelope>().notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("asset_tenant_id_idx").on(table.tenantId),
    index("asset_snapshot_id_idx").on(table.snapshotId),
    index("asset_snapshot_asset_class_idx").on(table.snapshotId, table.assetClass),
  ],
);

export const scanSnapshotRelations = relations(scanSnapshot, ({ one, many }) => ({
  scanJob: one(scanJob, {
    fields: [scanSnapshot.scanJobId],
    references: [scanJob.id],
  }),
  scanAttempt: one(scanAttempt, {
    fields: [scanSnapshot.scanAttemptId],
    references: [scanAttempt.id],
  }),
  assets: many(asset),
}));

export const assetRelations = relations(asset, ({ one }) => ({
  snapshot: one(scanSnapshot, {
    fields: [asset.snapshotId],
    references: [scanSnapshot.id],
  }),
  connector: one(connector, {
    fields: [asset.connectorId],
    references: [connector.id],
  }),
}));
