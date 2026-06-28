import { afterEach, describe, expect, it, vi } from "vitest";

import { validateConnectorCredentials } from "./validation";

describe("connector validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes successful GitHub validation to usable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      validateConnectorCredentials({
        sourceType: "github",
        credentials: { token: "valid-token" },
      }),
    ).resolves.toEqual({
      status: "valid",
      connectorStatus: "usable",
      message: "GitHub token is valid for read-only API access.",
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
