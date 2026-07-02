import type { Finding, FindingCode, NistMapping } from "./contracts";

const launchNistMappingMatrix: Record<FindingCode, NistMapping> = {
  certificate_expired: {
    mappingType: "direct",
    references: [
      {
        id: "NIST SP 1800-16",
        title: "Securing Web Transactions: TLS Server Certificate Management",
      },
    ],
    summary:
      "Expired certificate lifecycle management is directly addressed by TLS certificate management guidance; replace and re-issue.",
  },
  certificate_expiring_soon: {
    mappingType: "direct",
    references: [
      {
        id: "NIST SP 1800-16",
        title: "Securing Web Transactions: TLS Server Certificate Management",
      },
    ],
    summary:
      "Renewal-before-expiry is directly addressed by TLS certificate management guidance; plan replacement within the renewal window.",
  },
  tls_outdated_protocol: {
    mappingType: "direct",
    references: [
      {
        id: "NIST SP 800-52 Rev. 2",
        title: "Guidelines for the Selection, Configuration, and Use of TLS Implementations",
      },
    ],
    summary:
      "Protocols below TLS 1.2 are non-conformant with NIST TLS implementation guidance; upgrade to an approved protocol version.",
  },
  tls_weak_cipher: {
    mappingType: "direct",
    references: [
      {
        id: "NIST SP 800-52 Rev. 2",
        title: "Guidelines for the Selection, Configuration, and Use of TLS Implementations",
      },
    ],
    summary:
      "Weak cipher suites are outside the NIST-approved configuration set; reconfigure to approved cipher suites.",
  },
  dependency_vulnerable_package: {
    mappingType: "interpretation",
    references: [
      {
        id: "NIST SP 800-131A Rev. 2",
        title: "Transitioning the Use of Cryptographic Algorithms and Key Lengths",
      },
    ],
    summary:
      "Crypto-relevant package exposure is a product-interpreted signal to transition affected algorithms/libraries; no single normative statement names the package.",
  },
  hndl_exposure: {
    mappingType: "interpretation",
    references: [
      {
        id: "NIST IR 8547",
        title: "Transition to Post-Quantum Cryptography Standards",
      },
    ],
    summary:
      "Harvest-now-decrypt-later is a product-interpreted post-quantum migration risk; align long-lived confidentiality with the PQC transition direction rather than a single conformance statement.",
  },
  certificate_quantum_vulnerable_key: {
    mappingType: "interpretation",
    references: [
      {
        id: "NIST IR 8547",
        title: "Transition to Post-Quantum Cryptography Standards",
      },
      {
        id: "NIST SP 800-131A Rev. 2",
        title: "Transitioning the Use of Cryptographic Algorithms and Key Lengths",
      },
    ],
    summary:
      "RSA/EC/DSA public keys are breakable by a cryptographically relevant quantum computer; plan certificate replacement toward NIST post-quantum standards (FIPS 203/204/205).",
  },
};

export function nistMappingForCode(code: FindingCode): NistMapping | null {
  return launchNistMappingMatrix[code] ?? null;
}

export function applyNistMapping<T extends Omit<Finding, "nistMapping">>(
  finding: T,
): T & Pick<Finding, "nistMapping"> {
  return {
    ...finding,
    nistMapping: nistMappingForCode(finding.code),
  };
}
