const THREADFIN_PUBLIC_PATHS =
  "stream|m3u|xmltv|web|data|images|data_images|api|download|ppv|auto";

export function rewriteThreadfinDiscover(
  value: Record<string, unknown>,
  publicBaseUrl: string,
): Record<string, unknown> {
  return {
    ...value,
    BaseURL: publicBaseUrl,
    LineupURL: `${publicBaseUrl}/lineup.json`,
  };
}

export function rewriteThreadfinLineup(
  value: unknown,
  publicBaseUrl: string,
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const row = entry as Record<string, unknown>;
    const streamUrl = typeof row.URL === "string" ? row.URL : "";
    const streamPath = streamUrl.match(/\/stream\/[^?\s"']+(?:\?[^\s"']*)?$/)?.[0];
    return streamPath ? { ...row, URL: `${publicBaseUrl}${streamPath}` } : row;
  });
}

export function rewriteThreadfinText(
  value: string,
  publicBaseUrl: string,
): string {
  const absolute = new RegExp(
    `https?:\\/\\/[^/\\s"']+\\/(${THREADFIN_PUBLIC_PATHS})\\/`,
    "gi",
  );
  const rootRelative = new RegExp(
    `(["'(=])\\/(${THREADFIN_PUBLIC_PATHS})\\/`,
    "g",
  );
  const rootRelativeWithoutSlash = new RegExp(
    `(["'(=])\\/(${THREADFIN_PUBLIC_PATHS})(?=["')?\\s#;]|$)`,
    "g",
  );
  return value
    .replace(absolute, `${publicBaseUrl}/$1/`)
    .replace(rootRelative, `$1${publicBaseUrl}/$2/`)
    .replace(rootRelativeWithoutSlash, `$1${publicBaseUrl}/$2`);
}
