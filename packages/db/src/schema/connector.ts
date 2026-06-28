import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const connectorSourceType = pgEnum("connector_source_type", ["github", "aws"]);

export const connectorStatus = pgEnum("connector_status", [
  "pending_validation",
  "usable",
  "invalid",
  "unsupported",
]);

export const connectorValidationStatus = pgEnum("connector_validation_status", [
  "not_validated",
  "valid",
  "invalid",
  "unsupported",
]);

export const connector = pgTable(
  "connector",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceType: connectorSourceType("source_type").notNull(),
    displayName: text("display_name").notNull(),
    status: connectorStatus("status").default("pending_validation").notNull(),
    credentialCiphertext: text("credential_ciphertext").notNull(),
    credentialPreview: text("credential_preview"),
    lastValidationStatus: connectorValidationStatus("last_validation_status")
      .default("not_validated")
      .notNull(),
    lastValidationMessage: text("last_validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("connector_tenant_id_idx").on(table.tenantId),
    index("connector_tenant_status_idx").on(table.tenantId, table.status),
    index("connector_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

export const connectorRelations = relations(connector, ({ one }) => ({
  createdBy: one(user, {
    fields: [connector.createdByUserId],
    references: [user.id],
  }),
}));
