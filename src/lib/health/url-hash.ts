/**
 * Shared URL fingerprint for registry + health APIs (browser + Node).
 */
export async function hashStreamUrl(url: string): Promise<string> {
  const normalized = url.trim();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
