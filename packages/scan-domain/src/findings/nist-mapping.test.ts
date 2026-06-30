import { describe, expect, it } from "vitest";

import { findingCodes } from "./contracts";
import { nistMappingForCode } from "./nist-mapping";

describe("nistMappingForCode", () => {
  it("maps every launch finding code to a non-null mapping with the expected mappingType", () => {
    const expectedTypes: Record<(typeof findingCodes)[number], "direct" | "interpretation"> = {
      certificate_expired: "direct",
      certificate_expiring_soon: "direct",
      tls_outdated_protocol: "direct",
      tls_weak_cipher: "direct",
      dependency_vulnerable_package: "interpretation",
      hndl_exposure: "interpretation",
    };

    for (const code of findingCodes) {
      const mapping = nistMappingForCode(code);
      expect(mapping).not.toBeNull();
      expect(mapping?.mappingType).toBe(expectedTypes[code]);
      expect(mapping?.references.length).toBeGreaterThanOrEqual(1);
      expect(mapping?.references[0]?.id.length).toBeGreaterThan(0);
      expect(mapping?.references[0]?.title.length).toBeGreaterThan(0);
      expect(mapping?.summary.length).toBeGreaterThan(0);
    }
  });

  it("uses direct NIST certificate guidance for certificate lifecycle codes", () => {
    for (const code of ["certificate_expired", "certificate_expiring_soon"] as const) {
      const mapping = nistMappingForCode(code);
      expect(mapping?.mappingType).toBe("direct");
      expect(mapping?.references[0]?.id).toBe("NIST SP 1800-16");
    }
  });

  it("uses direct NIST TLS guidance for TLS posture codes", () => {
    for (const code of ["tls_outdated_protocol", "tls_weak_cipher"] as const) {
      const mapping = nistMappingForCode(code);
      expect(mapping?.mappingType).toBe("direct");
      expect(mapping?.references[0]?.id).toBe("NIST SP 800-52 Rev. 2");
    }
  });

  it("uses interpretation guidance for dependency and HNDL codes", () => {
    const dependency = nistMappingForCode("dependency_vulnerable_package");
    expect(dependency?.mappingType).toBe("interpretation");
    expect(dependency?.references[0]?.id).toBe("NIST SP 800-131A Rev. 2");

    const hndl = nistMappingForCode("hndl_exposure");
    expect(hndl?.mappingType).toBe("interpretation");
    expect(hndl?.references[0]?.id).toBe("NIST IR 8547");
  });
});
