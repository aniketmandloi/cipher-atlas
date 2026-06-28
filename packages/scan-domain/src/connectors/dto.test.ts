import { describe, expect, it } from "vitest";

import { credentialPreview, redactConnector } from "./dto";
import type { ConnectorRecord } from "./types";

describe("connector DTO helpers", () => {
  it("redacts credential ciphertext from connector records", () => {
    const connector: ConnectorRecord = {
      id: "connector_1",
      tenantId: "tenant_1",
      createdByUserId: "user_1",
      sourceType: "github",
      displayName: "GitHub production",
      status: "pending_validation",
      credentialCiphertext: "encrypted-secret",
      credentialPreview: "••••1234",
      lastValidationStatus: "not_validated",
      lastValidationMessage: null,
      lastValidatedAt: null,
      createdAt: new Date("2026-06-28T00:00:00.000Z"),
      updatedAt: new Date("2026-06-28T00:00:00.000Z"),
    };

    const redacted = redactConnector(connector);

    expect(redacted).not.toHaveProperty("credentialCiphertext");
    expect(redacted.credentialPreview).toBe("••••1234");
    expect(redacted.sourceType).toBe("github");
  });

  it("builds safe credential previews for GitHub and AWS credentials", () => {
    expect(credentialPreview("github", { token: "github_token_abcdef" })).toBe("••••cdef");
    expect(
      credentialPreview("aws", {
        accessKeyId: "AKIAEXAMPLE123456",
        secretAccessKey: "exampleSecretAccessKey123",
        region: "us-east-1",
      }),
    ).toBe("••••3456");
  });
});
