import "server-only";

function encoder(): TextEncoder {
  return new TextEncoder();
}

/** HS256 key material for access JWTs. */
export function getJwtSecretBytes(): Uint8Array {
  const raw =
    process.env.AUTH_JWT_SECRET ??
    process.env.CRON_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "dev-insecure-auth-secret-min-32chars!!"
      : "");
  if (!raw || raw.length < 16) {
    throw new Error(
      "Set AUTH_JWT_SECRET (or CRON_SECRET) to at least 16 characters.",
    );
  }
  const enc = encoder().encode(raw);
  if (enc.length >= 32) return enc.slice(0, 64);
  const out = new Uint8Array(32);
  out.set(enc);
  for (let i = enc.length; i < 32; i++) {
    out[i] = out[i % enc.length]! ^ out[(i + 7) % enc.length]!;
  }
  return out;
}
