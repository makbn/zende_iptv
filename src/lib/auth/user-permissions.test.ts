import { describe, expect, it } from "vitest";

import {
  getPersonalDataScope,
  personalDataStorageKey,
  setPersonalDataScope,
} from "@/lib/auth/personal-data-scope";
import { canMutateSystem } from "@/lib/auth/user-permissions";

describe("user authorization boundaries", () => {
  it("allows only administrators to mutate system state when login is enabled", () => {
    expect(canMutateSystem(true, "ADMIN")).toBe(true);
    expect(canMutateSystem(true, "USER")).toBe(false);
    expect(canMutateSystem(true)).toBe(false);
  });

  it("keeps legacy unauthenticated deployments operational", () => {
    expect(canMutateSystem(false)).toBe(true);
  });

  it("uses different browser keys for each account", () => {
    setPersonalDataScope("customer-a");
    const first = personalDataStorageKey("zende.favorites.v2");
    setPersonalDataScope("customer-b");
    const second = personalDataStorageKey("zende.favorites.v2");

    expect(first).not.toBe(second);
    expect(first).toContain("customer-a");
    expect(second).toContain("customer-b");
    expect(getPersonalDataScope()).toBe("customer-b");
  });
});
