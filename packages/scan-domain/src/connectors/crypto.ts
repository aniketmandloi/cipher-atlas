import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

export function encryptConnectorCredentials(credentials: unknown, encryptionKey: string): string {
  const iv = randomBytes(12);
  const key = normalizeKey(encryptionKey);
  const cipher = createCipheriv(algorithm, key, iv);
  const plaintext = JSON.stringify(credentials);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptConnectorCredentials<T>(ciphertext: string, encryptionKey: string): T {
  const [encodedIv, encodedAuthTag, encodedCiphertext] = ciphertext.split(".");

  if (!encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new Error("Invalid connector credential ciphertext format");
  }

  const decipher = createDecipheriv(
    algorithm,
    normalizeKey(encryptionKey),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}

function normalizeKey(encryptionKey: string): Buffer {
  return createHash("sha256").update(encryptionKey).digest();
}
