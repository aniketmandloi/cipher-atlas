import { describe, expect, it } from "vitest";

import type { ObservationCollectionScope } from "../collect";
import { collectGitHubObservations } from "./github";

const scope: ObservationCollectionScope = {
  tenantId: "tenant-1",
  snapshotId: "snapshot-1",
  scanJobId: "scan-1",
  scanAttemptId: "attempt-1",
  connectorId: "connector-1",
  connectorDisplayName: "GitHub",
  sourceType: "github",
  capturedAt: new Date("2026-06-29T12:00:00.000Z"),
};

const credentials = { token: "ghp_test_token" };

type RouteHandler = () => { status: number; body?: unknown; headers?: Record<string, string> };

function fetchStub(routes: Record<string, RouteHandler>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!route) {
      return new Response(JSON.stringify({ message: "not mocked" }), { status: 500 });
    }
    const { status, body, headers } = route[1]();
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }) as typeof fetch;
}

function base64(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

const CERT_PEM = "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n";
const KEY_PEM = "-----BEGIN RSA PRIVATE KEY-----\nMIIEfakekeymaterial\n-----END RSA PRIVATE KEY-----\n";

describe("collectGitHubObservations", () => {
  it("collects dependency manifests and committed certificates", async () => {
    const result = await collectGitHubObservations(scope, credentials, {
      fetchImpl: fetchStub({
        "https://api.github.com/user/repos": () => ({
          status: 200,
          body: [{ full_name: "octo/app" }],
        }),
        "https://api.github.com/user": () => ({ status: 200, body: { login: "octo" } }),
        "https://api.github.com/repos/octo/app/contents/package.json": () => ({
          status: 200,
          body: {
            content: base64(JSON.stringify({ dependencies: { "node-forge": "^1.3.1", react: "^19.0.0" } })),
            encoding: "base64",
          },
        }),
        "https://api.github.com/repos/octo/app/contents/requirements.txt": () => ({ status: 404 }),
        "https://api.github.com/repos/octo/app/contents/go.mod": () => ({ status: 404 }),
        "https://api.github.com/search/code": () => ({
          status: 200,
          body: {
            items: [
              {
                path: "certs/server.pem",
                url: "https://api.github.com/repos/octo/app/contents/certs/server.pem?ref=main",
                repository: { full_name: "octo/app" },
              },
            ],
          },
        }),
        "https://api.github.com/repos/octo/app/contents/certs/server.pem": () => ({
          status: 200,
          body: { content: base64(CERT_PEM), encoding: "base64" },
        }),
      }),
    });

    expect(result.coverageStatus).toBe("completed");
    expect(result.detailMessage).toBeNull();

    const dependencies = result.observations.filter((o) => o.assetClass === "dependency");
    expect(dependencies).toHaveLength(2);
    expect(dependencies[0]).toMatchObject({
      snapshotId: "snapshot-1",
      sourceType: "github",
      evidence: expect.objectContaining({
        packageName: "node-forge",
        packageVersion: "^1.3.1",
        manifestSource: "package.json",
        repository: "octo/app",
      }),
    });

    const certificates = result.observations.filter((o) => o.assetClass === "certificate");
    expect(certificates).toHaveLength(1);
    expect(certificates[0]?.evidence["certificatePem"]).toBe(CERT_PEM);
  });

  it("records committed private keys as HNDL signals without persisting key material", async () => {
    const result = await collectGitHubObservations(scope, credentials, {
      fetchImpl: fetchStub({
        "https://api.github.com/user/repos": () => ({ status: 200, body: [] }),
        "https://api.github.com/user": () => ({ status: 200, body: { login: "octo" } }),
        "https://api.github.com/search/code": () => ({
          status: 200,
          body: {
            items: [
              {
                path: "deploy/id_rsa.pem",
                url: "https://api.github.com/repos/octo/infra/contents/deploy/id_rsa.pem?ref=main",
                repository: { full_name: "octo/infra" },
              },
            ],
          },
        }),
        "https://api.github.com/repos/octo/infra/contents/deploy/id_rsa.pem": () => ({
          status: 200,
          body: { content: base64(KEY_PEM), encoding: "base64" },
        }),
      }),
    });

    expect(result.coverageStatus).toBe("completed");
    const signals = result.observations.filter((o) => o.assetClass === "hndl_signal");
    expect(signals).toHaveLength(1);
    expect(signals[0]?.evidence).toMatchObject({
      hndl_indicator: true,
      signalKind: "committed_private_key",
      repository: "octo/infra",
      path: "deploy/id_rsa.pem",
    });
    expect(JSON.stringify(result.observations)).not.toContain("fakekeymaterial");
  });

  it("fails when authentication is rejected", async () => {
    const result = await collectGitHubObservations(scope, credentials, {
      fetchImpl: fetchStub({
        "https://api.github.com/user": () => ({ status: 401, body: { message: "Bad credentials" } }),
      }),
    });

    expect(result.coverageStatus).toBe("failed");
    expect(result.observations).toHaveLength(0);
    expect(result.detailMessage).toContain("authentication failed");
  });

  it("reports partial coverage when code search is unavailable", async () => {
    const result = await collectGitHubObservations(scope, credentials, {
      fetchImpl: fetchStub({
        "https://api.github.com/user/repos": () => ({ status: 200, body: [{ full_name: "octo/app" }] }),
        "https://api.github.com/user": () => ({ status: 200, body: { login: "octo" } }),
        "https://api.github.com/repos/octo/app/contents/package.json": () => ({ status: 404 }),
        "https://api.github.com/repos/octo/app/contents/requirements.txt": () => ({
          status: 200,
          body: { content: base64("cryptography==41.0.0\n# comment\nrequests>=2.0\n"), encoding: "base64" },
        }),
        "https://api.github.com/repos/octo/app/contents/go.mod": () => ({ status: 404 }),
        "https://api.github.com/search/code": () => ({
          status: 403,
          body: { message: "Search disabled" },
          headers: { "x-ratelimit-remaining": "42" },
        }),
      }),
    });

    expect(result.coverageStatus).toBe("partial");
    expect(result.detailMessage).toContain("search unavailable");

    const dependencies = result.observations.filter((o) => o.assetClass === "dependency");
    expect(dependencies.map((o) => o.evidence["packageName"])).toEqual(["cryptography", "requests"]);
    expect(dependencies[0]?.evidence["packageVersion"]).toBe("41.0.0");
  });

  it("reports partial coverage when the rate limit is exhausted mid-scan", async () => {
    const result = await collectGitHubObservations(scope, credentials, {
      fetchImpl: fetchStub({
        "https://api.github.com/user/repos": () => ({ status: 200, body: [{ full_name: "octo/app" }] }),
        "https://api.github.com/user": () => ({ status: 200, body: { login: "octo" } }),
        "https://api.github.com/repos/octo/app/contents/package.json": () => ({
          status: 403,
          body: { message: "rate limited" },
          headers: { "x-ratelimit-remaining": "0" },
        }),
      }),
    });

    expect(result.coverageStatus).toBe("partial");
    expect(result.detailMessage).toContain("rate limit");
  });
});
