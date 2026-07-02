import type { GitHubCredentials } from "../../connectors";
import type { Observation } from "../../shared";
import type { ConnectorCollectionResult, ObservationCollectionScope } from "../collect";
import { baseObservation, combineSignals } from "./shared";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_REPOSITORIES = 25;
const MAX_DEPENDENCIES_PER_REPO = 200;
const MAX_PEM_SEARCH_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const MANIFEST_PATHS = ["package.json", "requirements.txt", "go.mod"] as const;

type ManifestPath = (typeof MANIFEST_PATHS)[number];

export interface GitHubCollectorOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

interface GitHubRepo {
  full_name: string;
}

interface GitHubContentFile {
  content?: string;
  encoding?: string;
}

interface GitHubSearchItem {
  path: string;
  url: string;
  repository?: { full_name?: string };
}

class GitHubRateLimitError extends Error {
  constructor() {
    super("GitHub API rate limit reached");
  }
}

export async function collectGitHubObservations(
  scope: ObservationCollectionScope,
  credentials: GitHubCredentials,
  options: GitHubCollectorOptions = {},
): Promise<ConnectorCollectionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const observations: Observation[] = [];
  const notes: string[] = [];

  const ghFetch = async (url: string): Promise<Response> => {
    const response = await fetchImpl(url.startsWith("https://") ? url : `${GITHUB_API_BASE}${url}`, {
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "cipher-atlas-scanner",
      },
      signal: combineSignals(options.signal, REQUEST_TIMEOUT_MS),
    });

    if (
      (response.status === 403 || response.status === 429) &&
      response.headers.get("x-ratelimit-remaining") === "0"
    ) {
      throw new GitHubRateLimitError();
    }

    return response;
  };

  let login: string;
  try {
    const userResponse = await ghFetch("/user");
    if (!userResponse.ok) {
      return failed(
        `GitHub authentication failed (HTTP ${userResponse.status}). Re-check the connector token and its read scopes, then retry the scan.`,
      );
    }
    login = ((await userResponse.json()) as { login: string }).login;
  } catch (error) {
    return failed(describeNetworkError("GitHub authentication request", error));
  }

  let repos: GitHubRepo[];
  try {
    const reposResponse = await ghFetch("/user/repos?per_page=100&sort=pushed");
    if (!reposResponse.ok) {
      return failed(
        `GitHub repository listing failed (HTTP ${reposResponse.status}). Grant the token repository read access and retry the scan.`,
      );
    }
    repos = (await reposResponse.json()) as GitHubRepo[];
  } catch (error) {
    return failed(describeNetworkError("GitHub repository listing", error));
  }

  const scannedRepos = repos.slice(0, MAX_REPOSITORIES);
  if (repos.length > MAX_REPOSITORIES) {
    notes.push(`Scanned the ${MAX_REPOSITORIES} most recently pushed of ${repos.length}+ repositories.`);
  }

  const failedRepos: string[] = [];
  let truncatedDependencyRepos = 0;

  try {
    for (const repo of scannedRepos) {
      try {
        const { emitted, truncated } = await collectRepoManifests(ghFetch, scope, repo, observations);
        if (truncated) {
          truncatedDependencyRepos += 1;
        }
        void emitted;
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          throw error;
        }
        failedRepos.push(repo.full_name);
      }
    }

    await collectCommittedPemFiles(ghFetch, scope, login, observations, notes);
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      notes.push("GitHub API rate limit reached before the scan finished; remaining repositories were skipped.");
    } else {
      notes.push(describeNetworkError("GitHub repository scan", error));
    }
  }

  if (failedRepos.length > 0) {
    notes.push(`Could not read dependency manifests in ${failedRepos.length} repository(ies): ${failedRepos.slice(0, 3).join(", ")}.`);
  }
  if (truncatedDependencyRepos > 0) {
    notes.push(`Dependency manifests truncated to ${MAX_DEPENDENCIES_PER_REPO} packages in ${truncatedDependencyRepos} repository(ies).`);
  }

  return {
    observations,
    coverageStatus: notes.length > 0 ? "partial" : "completed",
    detailMessage: notes.length > 0 ? notes.join(" ") : null,
  };
}

async function collectRepoManifests(
  ghFetch: (url: string) => Promise<Response>,
  scope: ObservationCollectionScope,
  repo: GitHubRepo,
  observations: Observation[],
): Promise<{ emitted: number; truncated: boolean }> {
  let emitted = 0;
  let truncated = false;

  for (const manifestPath of MANIFEST_PATHS) {
    const response = await ghFetch(`/repos/${repo.full_name}/contents/${manifestPath}`);
    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`Manifest fetch failed with HTTP ${response.status}`);
    }

    const file = (await response.json()) as GitHubContentFile;
    const content = decodeContentFile(file);
    if (content === null) {
      continue;
    }

    const packages = parseManifest(manifestPath, content);
    const budget = MAX_DEPENDENCIES_PER_REPO - emitted;
    if (packages.length > budget) {
      truncated = true;
    }

    for (const pkg of packages.slice(0, budget)) {
      observations.push(
        baseObservation(scope, "dependency", `github://${repo.full_name}/${manifestPath}#${pkg.name}`, {
          identifier: `${repo.full_name}:${manifestPath}:${pkg.name}`,
          packageName: pkg.name,
          ...(pkg.version ? { packageVersion: pkg.version } : {}),
          manifestSource: manifestPath,
          repository: repo.full_name,
        }),
      );
      emitted += 1;
    }

    if (emitted >= MAX_DEPENDENCIES_PER_REPO) {
      break;
    }
  }

  return { emitted, truncated };
}

async function collectCommittedPemFiles(
  ghFetch: (url: string) => Promise<Response>,
  scope: ObservationCollectionScope,
  login: string,
  observations: Observation[],
  notes: string[],
): Promise<void> {
  const query = encodeURIComponent(`user:${login} extension:pem`);
  let items: GitHubSearchItem[];

  try {
    const response = await ghFetch(`/search/code?q=${query}&per_page=${MAX_PEM_SEARCH_RESULTS}`);
    if (!response.ok) {
      notes.push(
        `Committed key/certificate search unavailable (HTTP ${response.status}); repository PEM files were not inventoried.`,
      );
      return;
    }
    items = ((await response.json()) as { items?: GitHubSearchItem[] }).items ?? [];
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      throw error;
    }
    notes.push("Committed key/certificate search failed; repository PEM files were not inventoried.");
    return;
  }

  for (const item of items.slice(0, MAX_PEM_SEARCH_RESULTS)) {
    const repository = item.repository?.full_name ?? "unknown-repository";
    try {
      const response = await ghFetch(item.url);
      if (!response.ok) {
        continue;
      }
      const content = decodeContentFile((await response.json()) as GitHubContentFile);
      if (content === null) {
        continue;
      }

      if (/-----BEGIN(?: (?:RSA|EC|DSA|OPENSSH|ENCRYPTED))? PRIVATE KEY-----/.test(content)) {
        // Never persist key material — record only the location as an HNDL signal.
        observations.push(
          baseObservation(scope, "hndl_signal", `github://${repository}/${item.path}`, {
            identifier: `${repository}:${item.path}:committed-private-key`,
            hndl_indicator: true,
            signalKind: "committed_private_key",
            repository,
            path: item.path,
          }),
        );
        continue;
      }

      if (content.includes("-----BEGIN CERTIFICATE-----")) {
        observations.push(
          baseObservation(scope, "certificate", `github://${repository}/${item.path}`, {
            identifier: `${repository}:${item.path}`,
            certificatePem: content,
            repository,
            path: item.path,
          }),
        );
      }
    } catch (error) {
      if (error instanceof GitHubRateLimitError) {
        throw error;
      }
      // Skip unreadable blobs; the search hit already proved existence, not readability.
    }
  }
}

function decodeContentFile(file: GitHubContentFile): string | null {
  if (typeof file.content !== "string" || file.content.length === 0) {
    return null;
  }
  if (file.encoding && file.encoding !== "base64") {
    return null;
  }

  try {
    return Buffer.from(file.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

interface ParsedPackage {
  name: string;
  version: string | null;
}

function parseManifest(manifestPath: ManifestPath, content: string): ParsedPackage[] {
  if (manifestPath === "package.json") {
    return parsePackageJson(content);
  }
  if (manifestPath === "requirements.txt") {
    return parseRequirementsTxt(content);
  }
  return parseGoMod(content);
}

function parsePackageJson(content: string): ParsedPackage[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }

  const packages: ParsedPackage[] = [];
  for (const section of ["dependencies", "devDependencies"] as const) {
    const deps = (parsed as Record<string, unknown>)[section];
    if (typeof deps !== "object" || deps === null) {
      continue;
    }
    for (const [name, version] of Object.entries(deps)) {
      packages.push({ name, version: typeof version === "string" ? version : null });
    }
  }

  return packages;
}

function parseRequirementsTxt(content: string): ParsedPackage[] {
  const packages: ParsedPackage[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) {
      continue;
    }

    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:(?:==|>=|<=|~=|!=|>|<)\s*([^\s;,#]+))?/.exec(line);
    if (match?.[1]) {
      packages.push({ name: match[1], version: match[2] ?? null });
    }
  }

  return packages;
}

function parseGoMod(content: string): ParsedPackage[] {
  const packages: ParsedPackage[] = [];
  let inRequireBlock = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("require (")) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && line.startsWith(")")) {
      inRequireBlock = false;
      continue;
    }

    const requireLine = inRequireBlock ? line : line.startsWith("require ") ? line.slice("require ".length) : null;
    if (!requireLine) {
      continue;
    }

    const match = /^([^\s]+)\s+([^\s/]+)/.exec(requireLine);
    if (match?.[1] && match[2] && !match[1].startsWith("//")) {
      packages.push({ name: match[1], version: match[2] });
    }
  }

  return packages;
}

function describeNetworkError(operation: string, error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return `${operation} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Retry the scan; if this persists, check network access to api.github.com.`;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `${operation} failed: ${detail}`;
}

function failed(detailMessage: string): ConnectorCollectionResult {
  return { observations: [], coverageStatus: "failed", detailMessage };
}
