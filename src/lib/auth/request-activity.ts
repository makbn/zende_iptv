import "server-only";

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

export function loginActivityFromRequest(request: Request) {
  const city =
    request.headers.get("cf-ipcity")?.trim() ||
    request.headers.get("x-vercel-ip-city")?.trim();
  const region =
    request.headers.get("cf-region")?.trim() ||
    request.headers.get("x-vercel-ip-country-region")?.trim();
  const country =
    request.headers.get("cf-ipcountry")?.trim() ||
    request.headers.get("x-vercel-ip-country")?.trim();
  const location = [city, region, country].filter(Boolean).join(", ") || null;

  return {
    lastLoginAt: new Date(),
    lastActivityAt: new Date(),
    lastLoginIp:
      firstHeaderValue(request.headers.get("cf-connecting-ip")) ||
      firstHeaderValue(request.headers.get("x-forwarded-for")) ||
      firstHeaderValue(request.headers.get("x-real-ip")),
    lastLoginLocation: location,
    lastLoginDevice: request.headers.get("user-agent")?.slice(0, 500) || null,
  };
}
