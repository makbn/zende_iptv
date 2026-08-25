import { describe, expect, it } from "vitest";

import { GET as mediaImageGet } from "@/app/api/media/image/[encoded]/route";
import { isPublicMediaAddress } from "@/lib/media/remote-media-security";

describe("remote media relay security", () => {
  it("rejects private and reserved addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1"]) {
      expect(isPublicMediaAddress(address)).toBe(false);
    }
    expect(isPublicMediaAddress("1.1.1.1")).toBe(true);
    expect(isPublicMediaAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("does not allow the public endpoint to reach localhost", async () => {
    const encoded = Buffer.from("thumbnail\0http://127.0.0.1/secret").toString("base64url");
    const response = await mediaImageGet(
      new Request(`https://live.example.test/api/media/image/${encoded}`),
      { params: Promise.resolve({ encoded }) },
    );
    expect(response.status).toBe(400);
  });
});
