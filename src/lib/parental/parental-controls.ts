const ENABLED_KEY = "zenede.parental.enabled.v1";
const PATTERNS_KEY = "zenede.parental.patterns.v1";
const PIN_KEY = "zenede.parental.pin.v1";

export type ParentalSettings = {
  enabled: boolean;
  /** Lowercase substring patterns matched against group-title segments. */
  hiddenPatterns: string[];
  pin: string | null;
};

function readPatterns(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PATTERNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function readParentalSettings(): ParentalSettings {
  if (typeof window === "undefined") {
    return { enabled: false, hiddenPatterns: [], pin: null };
  }
  const enabled = localStorage.getItem(ENABLED_KEY) === "1";
  const pin = localStorage.getItem(PIN_KEY);
  return {
    enabled,
    hiddenPatterns: readPatterns(),
    pin: pin && pin.length >= 4 ? pin : null,
  };
}

export function writeParentalEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* quota */
  }
}

export function writeParentalPatterns(patterns: string[]): void {
  const normalized = [
    ...new Set(
      patterns.map((s) => s.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  try {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(normalized));
  } catch {
    /* quota */
  }
}

export function writeParentalPin(pin: string | null): void {
  try {
    if (pin && pin.trim().length >= 4) {
      localStorage.setItem(PIN_KEY, pin.trim());
    } else {
      localStorage.removeItem(PIN_KEY);
    }
  } catch {
    /* quota */
  }
}

export function verifyParentalPin(candidate: string): boolean {
  const stored = readParentalSettings().pin;
  if (!stored) return true;
  return stored === candidate.trim();
}

/** True when the channel group should be hidden behind parental controls. */
export function isGroupParentalBlocked(groupTitle?: string | null): boolean {
  const { enabled, hiddenPatterns } = readParentalSettings();
  if (!enabled || hiddenPatterns.length === 0) return false;
  const hay = (groupTitle ?? "").trim().toLowerCase();
  if (!hay) return false;
  return hiddenPatterns.some((p) => hay.includes(p));
}
