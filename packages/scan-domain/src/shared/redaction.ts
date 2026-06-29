import type { RedactionMetadata } from "./types";

interface RedactionResult {
  value: string;
  metadata: RedactionMetadata;
}

const redactionRules = [
  {
    id: "github-token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/g,
    replacement: "[redacted-token]",
  },
  {
    id: "aws-access-key",
    pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
    replacement: "[redacted-access-key]",
  },
  {
    id: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[redacted-private-key]",
  },
  {
    id: "named-secret",
    pattern:
      /(?<key>secret|token|password|credential|authorization|accessKeyId|secretAccessKey|sessionToken)(?<sep>\s*[:=]\s*)(?<value>[^\s,;}]+)/gi,
    replacement: "$<key>$<sep>[redacted]",
  },
] as const;

export function redactEvidenceText(value: string): RedactionResult {
  const rulesApplied: string[] = [];
  let redacted = value;

  for (const rule of redactionRules) {
    if (rule.pattern.test(redacted)) {
      rulesApplied.push(rule.id);
      redacted = redacted.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  }

  return {
    value: redacted,
    metadata: {
      fields: [],
      rulesApplied,
    },
  };
}

export function redactEvidenceValue(value: unknown): { value: unknown; metadata: RedactionMetadata } {
  const fields = new Set<string>();
  const rules = new Set<string>();

  function redact(current: unknown, path: string): unknown {
    if (typeof current === "string") {
      const result = redactEvidenceText(current);
      for (const rule of result.metadata.rulesApplied) {
        rules.add(rule);
      }
      if (result.value !== current && path) {
        fields.add(path);
      }
      return result.value;
    }

    if (Array.isArray(current)) {
      return current.map((item, index) => redact(item, `${path}[${index}]`));
    }

    if (current && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).map(([key, child]) => {
          const childPath = path ? `${path}.${key}` : key;
          if (isSensitiveKey(key)) {
            fields.add(childPath);
            rules.add("sensitive-field");
            return [key, "[redacted]"];
          }

          return [key, redact(child, childPath)];
        }),
      );
    }

    return current;
  }

  return {
    value: redact(value, ""),
    metadata: {
      fields: [...fields].sort(),
      rulesApplied: [...rules].sort(),
    },
  };
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|credential|authorization|accessKeyId|secretAccessKey|sessionToken|privateKey/i.test(
    key,
  );
}
