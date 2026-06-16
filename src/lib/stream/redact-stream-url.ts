/**
 * Strip Xtream credentials from URLs before writing logs.
 * Paths like `/live/{user}/{pass}/123.m3u8` and query `?username=&password=`.
 */
export function redactStreamUrlForLog(url: string): string {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    const bucket = parts[0]?.toLowerCase();
    if (
      (bucket === "live" || bucket === "movie" || bucket === "series" || bucket === "vod") &&
      parts.length >= 3
    ) {
      parts[1] = "***";
      parts[2] = "***";
      u.pathname = `/${parts.join("/")}`;
    }
    if (u.searchParams.has("password")) u.searchParams.set("password", "***");
    if (u.searchParams.has("username")) u.searchParams.set("username", "***");
    return u.toString();
  } catch {
    return url
      .replace(/password=[^&]+/gi, "password=***")
      .replace(/username=[^&]+/gi, "username=***");
  }
}
