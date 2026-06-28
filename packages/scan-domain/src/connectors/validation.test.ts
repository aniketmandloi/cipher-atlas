import { afterEach, describe, expect, it, vi } from "vitest";

import { validateConnectorCredentials } from "./validation";

describe("connector validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps authenticated GitHub credentials pending until scan scope is configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      validateConnectorCredentials({
        sourceType: "github",
        credentials: { token: "valid-token" },
      }),
    ).resolves.toEqual({
      status: "valid",
      connectorStatus: "pending_validation",
      message:
        "GitHub token authenticated. Configure scan scope before using this connector for scans.",
    });
  });

  it("keeps authenticated AWS credentials pending until scan scope is configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      validateConnectorCredentials({
        sourceType: "aws",
        credentials: {
          accessKeyId: "AKIAEXAMPLE123456",
          secretAccessKey: "exampleSecretAccessKey123",
          region: "us-east-1",
        },
      }),
    ).resolves.toEqual({
      status: "valid",
      connectorStatus: "pending_validation",
      message:
        "AWS credentials authenticated with STS. Configure scan scope before using this connector for scans.",
    });
  });

  it("normalizes invalid GitHub credentials to invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(
      validateConnectorCredentials({
        sourceType: "github",
        credentials: { token: "bad-token" },
      }),
    ).resolves.toMatchObject({
      status: "invalid",
      connectorStatus: "invalid",
    });
  });

  it("normalizes provider network failures to unsupported", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network unavailable"));

    await expect(
      validateConnectorCredentials({
        sourceType: "aws",
        credentials: {
          accessKeyId: "AKIAEXAMPLE123456",
          secretAccessKey: "exampleSecretAccessKey123",
          region: "us-east-1",
        },
      }),
    ).resolves.toMatchObject({
      status: "unsupported",
      connectorStatus: "unsupported",
    });
  });
});
