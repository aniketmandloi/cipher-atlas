import { createHash, createHmac } from "node:crypto";

import type {
  AwsCredentials,
  ConnectorCredentialInput,
  ConnectorValidationResult,
  GitHubCredentials,
} from "./types";

export async function validateConnectorCredentials(
  input: ConnectorCredentialInput,
): Promise<ConnectorValidationResult> {
  if (input.sourceType === "github") {
    return validateGitHubCredentials(input.credentials);
  }

  return validateAwsCredentials(input.credentials);
}

async function validateGitHubCredentials(
  credentials: GitHubCredentials,
): Promise<ConnectorValidationResult> {
  const response = await fetchValidation("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${credentials.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response) {
    return {
      status: "unsupported",
      connectorStatus: "unsupported",
      message: "GitHub validation could not reach the provider. Check network access and try again.",
    };
  }

  if (response.ok) {
    return {
      status: "valid",
      connectorStatus: "usable",
      message: "GitHub token is valid for read-only API access.",
    };
  }

  if (response.status === 401) {
    return {
      status: "invalid",
      connectorStatus: "invalid",
      message: "GitHub token is invalid or expired.",
    };
  }

  if (response.status === 403) {
    return {
      status: "invalid",
      connectorStatus: "invalid",
      message: "GitHub token was accepted but lacks required read access.",
    };
  }

  return {
    status: "unsupported",
    connectorStatus: "unsupported",
    message: `GitHub validation could not complete. Provider returned HTTP ${response.status}.`,
  };
}

async function validateAwsCredentials(credentials: AwsCredentials): Promise<ConnectorValidationResult> {
  const host = `sts.${credentials.region}.amazonaws.com`;
  const response = await fetchValidation(`https://${host}/`, {
    method: "POST",
    headers: signedStsHeaders(credentials, host),
    body: "Action=GetCallerIdentity&Version=2011-06-15",
  });

  if (!response) {
    return {
      status: "unsupported",
      connectorStatus: "unsupported",
      message: "AWS validation could not reach STS. Check network access, region, and try again.",
    };
  }

  if (response.ok) {
    return {
      status: "valid",
      connectorStatus: "usable",
      message: "AWS credentials authenticated with read-only STS caller identity access.",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      status: "invalid",
      connectorStatus: "invalid",
      message: "AWS credentials are invalid or missing required STS read access.",
    };
  }

  return {
    status: "unsupported",
    connectorStatus: "unsupported",
    message: `AWS validation could not complete. Provider returned HTTP ${response.status}.`,
  };
}

async function fetchValidation(input: string, init: RequestInit): Promise<Response | undefined> {
  try {
    return await fetch(input, init);
  } catch {
    return undefined;
  }
}

function signedStsHeaders(credentials: AwsCredentials, host: string): Record<string, string> {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const region = credentials.region;
  const service = "sts";
  const payload = "Action=GetCallerIdentity&Version=2011-06-15";
  const payloadHash = sha256(payload);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host,
    "x-amz-date": amzDate,
  };

  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join("");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");

  return {
    ...headers,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  };
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, service);
  return hmac(dateRegionServiceKey, "aws4_request");
}
