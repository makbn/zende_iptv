import { describe, expect, it } from "vitest";

import { isProtectedApiReady } from "@/lib/auth/api-readiness";

describe("protected API readiness", () => {
  it("waits for auth initialization", () => {
    expect(isProtectedApiReady({ ready: false, authEnabled: false, hasUser: false })).toBe(false);
  });

  it("allows guest requests only when authentication is disabled", () => {
    expect(isProtectedApiReady({ ready: true, authEnabled: false, hasUser: false })).toBe(true);
    expect(isProtectedApiReady({ ready: true, authEnabled: true, hasUser: false })).toBe(false);
  });

  it("allows protected requests after login", () => {
    expect(isProtectedApiReady({ ready: true, authEnabled: true, hasUser: true })).toBe(true);
  });
});
