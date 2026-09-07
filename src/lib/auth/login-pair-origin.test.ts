import { describe, expect, it } from "vitest";

import { loginPairOrigin } from "./login-pair-origin";

describe("loginPairOrigin", () => {
  it("uses the TV browser origin when the application request is localhost", () => {
    const request = new Request("http://localhost:8077/api/auth/login/pair", {
      method: "POST",
      headers: {
        Host: "localhost:8077",
        Origin: "https://tv.example.test",
      },
    });

    expect(loginPairOrigin(request, "")).toBe("https://tv.example.test");
  });

  it("falls back to the page referer when Origin is unavailable", () => {
    const request = new Request("http://localhost:8077/api/auth/login/pair", {
      method: "POST",
      headers: { Referer: "https://tv.example.test/login?tv=1" },
    });

    expect(loginPairOrigin(request, "")).toBe("https://tv.example.test");
  });

  it("ignores an explicitly configured loopback URL for a remote login", () => {
    const request = new Request("http://localhost:8077/api/auth/login/pair", {
      method: "POST",
      headers: { Origin: "https://tv.example.test" },
    });

    expect(loginPairOrigin(request, "http://localhost:8077")).toBe(
      "https://tv.example.test",
    );
  });
});
