import { relations } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { connector, connectorSourceType, connectorStatus } from "./connector";

export const coverageStatus = pgEnum("coverage_status", [
  "completed",
  "partial",
  "failed",
  "skipped",
  "unsupported",
]);

export const scanStatus = pgEnum("scan_status", ["queued", "running", "completed", "failed"]);

export const scanJob = pgTable(
  "scan_job",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: scanStatus("status").default("queued").notNull(),
    failureMessage: text("failure_message"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("scan_job_tenant_id_idx").on(table.tenantId),
    index("scan_job_tenant_status_idx").on(table.tenantId, table.status),
    index("scan_job_created_by_user_id_idx").on(table.createdByUserId),
    index("scan_job_queued_idx").on(table.status, table.queuedAt),
  ],
);

export const scanJobConnector = pgTable(
  "scan_job_connector",
  {
    scanJobId: text("scan_job_id")
      .notNull()
      .references(() => scanJob.id, { onDelete: "cascade" }),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connector.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id").notNull(),
    sourceType: connectorSourceType("source_type").notNull(),
    displayName: text("display_name").notNull(),
    statusAtLaunch: connectorStatus("status_at_launch").notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scanJobId, table.connectorId] }),
    index("scan_job_connector_tenant_id_idx").on(table.tenantId),
    index("scan_job_connector_connector_id_idx").on(table.connectorId),
  ],
);

export const scanAttempt = pgTable(
  "scan_attempt",
  {
    id: text("id").primaryKey(),
    scanJobId: text("scan_job_id")
      .notNull()
      .references(() => scanJob.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: scanStatus("status").notNull(),
    workerId: text("worker_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureMessage: text("failure_message"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("scan_attempt_scan_job_attempt_number_idx").on(table.scanJobId, table.attemptNumber),
    uniqueIndex("scan_attempt_scan_job_id_id_idx").on(table.scanJobId, table.id),
    index("scan_attempt_tenant_id_idx").on(table.tenantId),
    index("scan_attempt_scan_job_id_idx").on(table.scanJobId),
  ],
);

export const coverageSlice = pgTable(
  "coverage_slice",
  {
    id: text("id").primaryKey(),
    scanJobId: text("scan_job_id")
      .notNull()
      .references(() => scanJob.id, { onDelete: "cascade" }),
    scanAttemptId: text("scan_attempt_id")
      .notNull()
      .references(() => scanAttempt.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    connectorId: text("connector_id").references(() => connector.id, { onDelete: "set null" }),
    connectorDisplayName: text("connector_display_name").notNull(),
    sourceType: connectorSourceType("source_type"),
    segmentLabel: text("segment_label"),
    coverageStatus: coverageStatus("coverage_status").notNull(),
    detailMessage: text("detail_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.scanJobId, table.scanAttemptId],
      foreignColumns: [scanAttempt.scanJobId, scanAttempt.id],
    }),
    index("coverage_slice_scan_job_id_idx").on(table.scanJobId),
    index("coverage_slice_scan_attempt_id_idx").on(table.scanAttemptId),
    index("coverage_slice_tenant_id_idx").on(table.tenantId),
    index("coverage_slice_scan_job_coverage_status_idx").on(table.scanJobId, table.coverageStatus),
  ],
);

export const scanJobRelations = relations(scanJob, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [scanJob.createdByUserId],
    references: [user.id],
  }),
  connectors: many(scanJobConnector),
  attempts: many(scanAttempt),
  coverageSlices: many(coverageSlice),
}));

export const scanJobConnectorRelations = relations(scanJobConnector, ({ one }) => ({
  scanJob: one(scanJob, {
    fields: [scanJobConnector.scanJobId],
    references: [scanJob.id],
  }),
  connector: one(connector, {
    fields: [scanJobConnector.connectorId],
    references: [connector.id],
  }),
}));

export const scanAttemptRelations = relations(scanAttempt, ({ one }) => ({
  scanJob: one(scanJob, {
    fields: [scanAttempt.scanJobId],
    references: [scanJob.id],
  }),
}));

export const coverageSliceRelations = relations(coverageSlice, ({ one }) => ({
  scanJob: one(scanJob, {
    fields: [coverageSlice.scanJobId],
    references: [scanJob.id],
  }),
  scanAttempt: one(scanAttempt, {
    fields: [coverageSlice.scanAttemptId],
    references: [scanAttempt.id],
  }),
  connector: one(connector, {
    fields: [coverageSlice.connectorId],
    references: [connector.id],
  }),
}));
