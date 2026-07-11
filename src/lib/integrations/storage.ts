import type { IntegrationKind, StoredIntegration } from "@/lib/integrations/types";

const STORAGE_KEY = "zende.integrations.v1";

const KINDS: ReadonlySet<string> = new Set<IntegrationKind>([
  "plex",
  "jellyfin",
  "emby",
  "generic_standards",
  "other",
]);

function safeParse(raw: string | null): StoredIntegration[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(isStoredIntegration);
  } catch {
    return [];
  }
}

function isStoredIntegration(x: unknown): x is StoredIntegration {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.kind === "string" &&
    KINDS.has(o.kind) &&
    typeof o.name === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number"
  );
}

export function loadIntegrations(): StoredIntegration[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveIntegrations(list: StoredIntegration[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function upsertIntegration(entry: StoredIntegration): void {
  const list = loadIntegrations();
  const i = list.findIndex((x) => x.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  saveIntegrations(list);
}

export function removeIntegration(id: string): void {
  saveIntegrations(loadIntegrations().filter((x) => x.id !== id));
}
