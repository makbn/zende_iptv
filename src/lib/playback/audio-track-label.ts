/** Short IPTV-style language codes for the audio track picker. */
const LANG_SHORT: Record<string, string> = {
  eng: "EN",
  en: "EN",
  fra: "FR",
  fre: "FR",
  fr: "FR",
  deu: "DE",
  ger: "DE",
  de: "DE",
  spa: "ES",
  es: "ES",
  ita: "IT",
  it: "IT",
  por: "PT",
  pt: "PT",
  bra: "PT",
  ara: "AR",
  ar: "AR",
  fas: "FA",
  per: "FA",
  fa: "FA",
  tur: "TR",
  tr: "TR",
  rus: "RU",
  ru: "RU",
  zho: "ZH",
  chi: "ZH",
  zh: "ZH",
  jpn: "JA",
  ja: "JA",
  kor: "KO",
  ko: "KO",
  hin: "HI",
  hi: "HI",
  nld: "NL",
  dut: "NL",
  nl: "NL",
  ell: "GR",
  gre: "GR",
  el: "GR",
  pol: "PL",
  pl: "PL",
  ukr: "UK",
  uk: "UK",
  hun: "HU",
  hu: "HU",
  ces: "CZ",
  cze: "CZ",
  cs: "CZ",
  swe: "SV",
  sv: "SV",
  nor: "NO",
  nob: "NO",
  no: "NO",
  dan: "DA",
  da: "DA",
  fin: "FI",
  fi: "FI",
  ron: "RO",
  rum: "RO",
  ro: "RO",
  bul: "BG",
  bg: "BG",
  hrv: "HR",
  hr: "HR",
  srp: "SR",
  sr: "SR",
  heb: "HE",
  he: "HE",
  tha: "TH",
  th: "TH",
  vie: "VI",
  vi: "VI",
  ind: "ID",
  id: "ID",
  may: "MS",
  ms: "MS",
  lav: "LV",
  lv: "LV",
  lit: "LT",
  lt: "LT",
  est: "ET",
  et: "ET",
  cat: "CA",
  ca: "CA",
  glg: "GL",
  gl: "GL",
  eus: "EU",
  eu: "EU",
  qaa: "ORIG",
  und: "",
  unknown: "",
};

const GENERIC_TITLE_RE =
  /^(?:audio(?:\s*track)?|track|stream|sound|und|unknown|n\/a)?\s*\d*$/i;

const SPECIAL_TITLE_RE =
  /commentary|director|descript|narrat|\bad\b|sdh|forced|original|atmos|dts|truehd|commentary/i;

export type AudioTrackLabelInput = {
  index: number;
  language?: string | null;
  title?: string | null;
  channels?: number | null;
  channelLayout?: string | null;
};

/** Normalize ISO / ffprobe language tags to a short display code (EN, FR, GR…). */
export function shortAudioLanguage(code: string | null | undefined): string | undefined {
  const raw = (code ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (LANG_SHORT[raw] !== undefined) {
    const mapped = LANG_SHORT[raw];
    return mapped || undefined;
  }
  if (/^[a-z]{2,3}$/i.test(raw)) return raw.toUpperCase();
  return undefined;
}

/** Compact channel layout: 5.1, 7.1, Atmos — omit plain stereo/mono. */
export function shortAudioLayout(input: {
  channels?: number | null;
  channelLayout?: string | null;
  title?: string | null;
}): string | undefined {
  const title = (input.title ?? "").toLowerCase();
  if (/atmos/i.test(title)) return "Atmos";
  if (/\b7\.1\b/.test(title)) return "7.1";
  if (/\b5\.1\b/.test(title)) return "5.1";

  const layout = (input.channelLayout ?? "").trim().toLowerCase();
  if (layout) {
    if (layout.includes("atmos")) return "Atmos";
    if (layout.startsWith("7.1") || layout.includes("7.1")) return "7.1";
    if (layout.startsWith("5.1") || layout.includes("5.1")) return "5.1";
    if (layout.startsWith("6.1") || layout.includes("6.1")) return "6.1";
    if (layout === "quad" || layout.startsWith("4.0")) return "4.0";
    if (layout === "stereo" || layout === "mono") return undefined;
  }

  const channels =
    typeof input.channels === "number" && Number.isFinite(input.channels)
      ? Math.round(input.channels)
      : 0;
  if (channels >= 8) return "7.1";
  if (channels === 7) return "6.1";
  if (channels === 6) return "5.1";
  if (channels === 4) return "4.0";
  return undefined;
}

function isGenericTitle(title: string): boolean {
  return !title.trim() || GENERIC_TITLE_RE.test(title.trim());
}

/**
 * Build a compact player label: `EN 5.1`, `FR`, `GR`, `EN Commentary`.
 * Prefers language + layout over generic "Track N" / stream titles.
 */
export function formatAudioTrackLabel(input: AudioTrackLabelInput): string {
  const lang = shortAudioLanguage(input.language);
  const layout = shortAudioLayout({
    channels: input.channels,
    channelLayout: input.channelLayout,
    title: input.title,
  });
  const title = (input.title ?? "").trim();

  if (title && !isGenericTitle(title) && SPECIAL_TITLE_RE.test(title)) {
    const cleaned = title.replace(/\s+/g, " ").trim();
    if (lang && !new RegExp(`\\b${lang}\\b`, "i").test(cleaned)) {
      return `${lang} ${cleaned}`;
    }
    return cleaned;
  }

  // Useful provider titles like "English", "Francais 5.1" — normalize when we can.
  if (title && !isGenericTitle(title) && !lang) {
    return title.replace(/\s+/g, " ").trim();
  }

  if (lang && layout) return `${lang} ${layout}`;
  if (lang) return lang;
  if (layout) return layout;

  if (title && !isGenericTitle(title)) return title.replace(/\s+/g, " ").trim();
  return `Track ${input.index + 1}`;
}

/** Ensure duplicate labels stay distinguishable in the picker. */
export function uniquifyAudioTrackLabels<T extends { label: string }>(
  tracks: T[],
): T[] {
  const seen = new Map<string, number>();
  return tracks.map((track) => {
    const base = track.label;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count === 1) return track;
    return { ...track, label: `${base} (${count})` };
  });
}
