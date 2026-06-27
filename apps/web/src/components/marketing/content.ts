// Single source of truth for every landing-page variant (/1–/6).
// Variants differ in visual treatment only; the words live here.

export type Risk = "critical" | "high" | "medium" | "low";

export const brand = {
  name: "Cipher Atlas",
  mark: "CA",
} as const;

export const nav = {
  links: [
    { label: "Product", href: "#product" },
    { label: "How it works", href: "#how" },
    { label: "Coverage", href: "#coverage" },
    { label: "Pricing", href: "#pricing" },
  ],
  signIn: { label: "Sign in", href: "/login" },
  cta: { label: "Book a pilot", href: "#pilot" },
} as const;

export const hero = {
  eyebrow: "NIST FIPS 203/204/205 · Google's 2029 readiness deadline",
  headline: "Quantum-proof your stack. Before the deadline does it for you.",
  sub: "Cipher Atlas scans your infrastructure, code, and credential stores in one pass — then maps every key, certificate, and TLS config to NIST migration standards with a risk level and replacement priority.",
  primaryCta: { label: "Book a pilot", href: "#pilot" },
  secondaryCta: { label: "See a sample report", href: "#product" },
} as const;

export const trust = {
  line: "Built on NIST post-quantum standards. Trusted in regulated industries.",
  verticals: ["Finance", "Healthcare", "Manufacturing"],
} as const;

export const problem = {
  kicker: "Harvest now, decrypt later",
  title: "Encrypted today. Decrypted the day quantum matures.",
  body: "Nation-states are recording encrypted traffic now to break it later. Legacy certificates pile up in production and outdated crypto libraries hide in buried dependencies. Most mid-market teams have zero inventory of what breaks when quantum arrives.",
  points: [
    "RSA and ECC keys that quantum will eventually factor",
    "TLS configurations no one has audited in years",
    "Vulnerable crypto packages deep in the dependency tree",
  ],
} as const;

export type Step = {
  n: string;
  title: string;
  body: string;
};

export const steps: Step[] = [
  {
    n: "01",
    title: "Connect, read-only",
    body: "Link GitHub, GitLab, AWS, Azure, and GCP one at a time through scoped read-only access. Nothing is written, nothing is changed.",
  },
  {
    n: "02",
    title: "Scan & parse",
    body: "OpenSSL reads your certificates while custom parsers walk raw TLS configs and dependency manifests across infra, code, and credential stores.",
  },
  {
    n: "03",
    title: "NIST-mapped dashboard",
    body: "Every finding lands in a categorized dashboard with a risk level, a NIST migration mapping, and a replacement priority you can act on.",
  },
];

export type Category = {
  id: string;
  name: string;
  blurb: string;
  sample: string;
  risk: Risk;
};

export const categories: Category[] = [
  {
    id: "rsa",
    name: "RSA & ECC keys",
    blurb: "Asymmetric keys quantum will eventually break, ranked by exposure.",
    sample: "RSA-2048 · 41 keys",
    risk: "high",
  },
  {
    id: "tls",
    name: "Outdated TLS",
    blurb: "Deprecated protocol versions and weak cipher suites still in use.",
    sample: "TLS 1.0 · 7 endpoints",
    risk: "critical",
  },
  {
    id: "packages",
    name: "Vulnerable packages",
    blurb: "Crypto libraries with known weaknesses hiding in dependencies.",
    sample: "3 manifests flagged",
    risk: "medium",
  },
  {
    id: "certs",
    name: "Certificates",
    blurb: "Renewal timelines and expiries mapped before they bite.",
    sample: "2 expire in 14 days",
    risk: "medium",
  },
  {
    id: "hndl",
    name: "Harvest-now exposure",
    blurb: "Long-lived secrets most at risk from record-now-decrypt-later.",
    sample: "12 high-value flows",
    risk: "critical",
  },
];

export type Finding = {
  id: string;
  asset: string;
  detail: string;
  nist: string;
  risk: Risk;
};

// Sample rows for the dashboard / console mocks.
export const findings: Finding[] = [
  {
    id: "CA-1042",
    asset: "RSA-2048",
    detail: "api-gateway · TLS leaf key",
    nist: "FIPS 203 · ML-KEM",
    risk: "high",
  },
  {
    id: "CA-1043",
    asset: "TLS 1.0",
    detail: "legacy-billing.internal",
    nist: "SP 800-52 Rev. 2",
    risk: "critical",
  },
  {
    id: "CA-1044",
    asset: "openssl 1.0.2",
    detail: "payments-service · lockfile",
    nist: "FIPS 204 · ML-DSA",
    risk: "medium",
  },
  {
    id: "CA-1045",
    asset: "Cert expiry",
    detail: "*.acme-health.com · 14 days",
    nist: "SP 1800-16",
    risk: "medium",
  },
  {
    id: "CA-1046",
    asset: "Static secret",
    detail: "data-warehouse · 30-yr value",
    nist: "Harvest-now risk",
    risk: "critical",
  },
];

export const dashboardStats = {
  scanned: "1,284",
  findings: "124",
  critical: "12",
  agreement: "95%",
} as const;

export const proof = {
  stat: "95%",
  statLabel: "agreement with manual audits",
  title: "Audit-grade accuracy, in a fraction of the time.",
  body: "Cipher Atlas targets 95% agreement against expert manual audits — so the inventory you hand to procurement and compliance holds up under scrutiny.",
  facts: [
    { k: "5", v: "clouds & code hosts connected read-only" },
    { k: "1", v: "scan to a full cryptographic inventory" },
    { k: "2029", v: "Google's quantum-readiness deadline" },
  ],
} as const;

export const pricing = {
  tier: "Full roadmap",
  price: "$299",
  period: "/month",
  blurb: "One tier. The complete cryptographic inventory and migration roadmap.",
  features: [
    "Unlimited scans across infra, code & credential stores",
    "NIST-mapped findings with risk & replacement priority",
    "Certificate renewal timelines & expiry alerts",
    "Harvest-now-decrypt-later exposure analysis",
    "Quarterly compliance-ready reporting",
  ],
  secondary: "White-label & MSP licensing available for partners.",
  cta: { label: "Book a pilot", href: "#pilot" },
} as const;

export const finalCta = {
  title: "The deadline is fixed. Your inventory isn't — yet.",
  body: "Book a pilot and get your first NIST-mapped cryptographic inventory in days, not quarters.",
  cta: { label: "Book a pilot", href: "#pilot" },
} as const;

export const footer = {
  tagline: "Map your cryptographic footprint before quantum redraws it.",
  columns: [
    {
      title: "Product",
      links: ["Overview", "Coverage", "Pricing", "Sample report"],
    },
    {
      title: "Company",
      links: ["About", "Partners", "Security", "Contact"],
    },
    {
      title: "Resources",
      links: ["NIST PQC", "Migration guide", "Docs", "Status"],
    },
  ],
} as const;

export const riskLabel: Record<Risk, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
