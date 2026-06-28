import { describe, expect, it } from "vitest";

import { decryptConnectorCredentials, encryptConnectorCredentials } from "./crypto";

describe("connector credential encryption", () => {
  it("round-trips credential material without storing plaintext", () => {
    const key = "test-encryption-key-with-at-least-32-characters";
    const credentials = {
      token: "github_pat_secret",
    };

    const ciphertext = encryptConnectorCredentials(credentials, key);
    const decrypted = decryptConnectorCredentials<typeof credentials>(ciphertext, key);

    expect(ciphertext).not.toContain(credentials.token);
    expect(decrypted).toEqual(credentials);
  });

  it("rejects malformed ciphertext", () => {
    expect(() =>
      decryptConnectorCredentials("not-valid", "test-encryption-key-with-at-least-32-characters"),
    ).toThrow("Invalid connector credential ciphertext format");
  });
});
