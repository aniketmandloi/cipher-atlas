import { db } from "@cipher-atlas/db";
import { connector } from "@cipher-atlas/db/schema/connector";
import { env } from "@cipher-atlas/env/server";
import {
  awsCredentialSchema,
  connectorCredentialSchema,
  githubCredentialSchema,
  credentialPreview,
  decryptConnectorCredentials,
  encryptConnectorCredentials,
  redactConnector,
  validateConnectorCredentials,
  type AwsCredentials,
  type ConnectorCredentialInput,
  type ConnectorRecord,
  type GitHubCredentials,
} from "@cipher-atlas/scan-domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const createConnectorInput = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("github"),
    displayName: z.string().trim().min(1).max(120),
    credentials: githubCredentialSchema,
  }),
  z.object({
    sourceType: z.literal("aws"),
    displayName: z.string().trim().min(1).max(120),
    credentials: awsCredentialSchema,
  }),
]);

const getConnectorInput = z.object({
  id: z.string().min(1),
});

export const connectorsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = tenantScope(ctx.session.user.id);
    const rows = await db
      .select()
      .from(connector)
      .where(eq(connector.tenantId, tenantId))
      .orderBy(desc(connector.createdAt));

    return rows.map((row) => redactConnector(row));
  }),

  get: protectedProcedure.input(getConnectorInput).query(async ({ ctx, input }) => {
    const row = await findTenantConnector(input.id, ctx.session.user.id);

    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Connector not found",
      });
    }

    return redactConnector(row);
  }),

  create: protectedProcedure.input(createConnectorInput).mutation(async ({ ctx, input }) => {
    const credentialInput = normalizeCredentialInput(input);
    const [created] = await db
      .insert(connector)
      .values({
        id: randomUUID(),
        tenantId: tenantScope(ctx.session.user.id),
        createdByUserId: ctx.session.user.id,
        sourceType: credentialInput.sourceType,
        displayName: input.displayName,
        status: "pending_validation",
        credentialCiphertext: encryptConnectorCredentials(
          credentialInput.credentials,
          env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY,
        ),
        credentialPreview:
          credentialInput.sourceType === "github"
            ? credentialPreview("github", credentialInput.credentials)
            : credentialPreview("aws", credentialInput.credentials),
        lastValidationStatus: "not_validated",
        lastValidationMessage: "Connector created. Run validation before using it for scans.",
      })
      .returning();

    if (!created) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Connector could not be created",
      });
    }

    return redactConnector(created);
  }),

  validate: protectedProcedure.input(getConnectorInput).mutation(async ({ ctx, input }) => {
    const row = await findTenantConnector(input.id, ctx.session.user.id);

    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Connector not found",
      });
    }

    const credentials = decryptStoredCredentials(row);
    const result = await validateConnectorCredentials({
      sourceType: row.sourceType,
      credentials,
    } as ConnectorCredentialInput);
    const [updated] = await db
      .update(connector)
      .set({
        status: result.connectorStatus,
        lastValidationStatus: result.status,
        lastValidationMessage: result.message,
        lastValidatedAt: new Date(),
      })
      .where(and(eq(connector.id, row.id), eq(connector.tenantId, tenantScope(ctx.session.user.id))))
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Connector validation result could not be saved",
      });
    }

    return redactConnector(updated);
  }),
});

function tenantScope(userId: string): string {
  return userId;
}

async function findTenantConnector(id: string, userId: string): Promise<ConnectorRecord | undefined> {
  const [row] = await db
    .select()
    .from(connector)
    .where(and(eq(connector.id, id), eq(connector.tenantId, tenantScope(userId))))
    .limit(1);

  return row;
}

function normalizeCredentialInput(input: z.infer<typeof createConnectorInput>): ConnectorCredentialInput {
  return connectorCredentialSchema.parse({
    sourceType: input.sourceType,
    credentials: input.credentials,
  });
}

function decryptStoredCredentials(row: ConnectorRecord): GitHubCredentials | AwsCredentials {
  if (row.sourceType === "github") {
    return decryptConnectorCredentials<GitHubCredentials>(
      row.credentialCiphertext,
      env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY,
    );
  }

  return decryptConnectorCredentials<AwsCredentials>(
    row.credentialCiphertext,
    env.CONNECTOR_CREDENTIAL_ENCRYPTION_KEY,
  );
}
