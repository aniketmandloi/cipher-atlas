import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { scanSnapshot } from "./inventory";

export const reportArtifactFormat = pgEnum("report_artifact_format", ["pdf", "csv"]);

export const reportArtifact = pgTable(
  "report_artifact",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    scanJobId: text("scan_job_id").notNull(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => scanSnapshot.id, { onDelete: "cascade" }),
    format: reportArtifactFormat("format").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    generatedByUserId: text("generated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("report_artifact_snapshot_format_idx").on(table.snapshotId, table.format),
    index("report_artifact_tenant_id_idx").on(table.tenantId),
    index("report_artifact_scan_job_id_idx").on(table.scanJobId),
  ],
);

export const reportArtifactRelations = relations(reportArtifact, ({ one }) => ({
  snapshot: one(scanSnapshot, {
    fields: [reportArtifact.snapshotId],
    references: [scanSnapshot.id],
  }),
  generatedByUser: one(user, {
    fields: [reportArtifact.generatedByUserId],
    references: [user.id],
  }),
}));
