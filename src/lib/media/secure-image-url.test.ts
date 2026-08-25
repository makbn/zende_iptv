import { describe, expect, it } from "vitest";

import { secureImageUrl } from "@/lib/media/secure-image-url";

describe("secureImageUrl", () => {
  it("routes remote artwork through the same-origin backend", () => {
    const output = secureImageUrl("http://images.example.test/logo.png?size=2", undefined, "logo")!;
    expect(output).toMatch(/^\/api\/media\/image\/[A-Za-z0-9_-]+$/);
    expect(Buffer.from(output.split("/").at(-1)!, "base64url").toString("utf8")).toBe(
      "logo\0http://images.example.test/logo.png?size=2",
    );
  });

  it("can emit an absolute backend URL for IPTV and XMLTV clients", () => {
    const output = secureImageUrl(
      "https://images.example.test/logo.png",
      "https://live.example.test",
      "poster",
    )!;
    expect(output).toMatch(/^https:\/\/live\.example\.test\/api\/media\/image\/[A-Za-z0-9_-]+$/);
    expect(Buffer.from(new URL(output).pathname.split("/").at(-1)!, "base64url").toString("utf8")).toBe(
      "poster\0https://images.example.test/logo.png",
    );
  });

  it("preserves local, data, and blob resources", () => {
    expect(secureImageUrl("/zende-logo.svg")).toBe("/zende-logo.svg");
    expect(secureImageUrl("data:image/png;base64,AA==")).toBe("data:image/png;base64,AA==");
    expect(secureImageUrl("blob:https://live.example.test/id")).toBe("blob:https://live.example.test/id");
  });
});
