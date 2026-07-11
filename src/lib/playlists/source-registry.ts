const REGISTRY_KEY = "zende.playlistRegistry.v1";

export type RegisteredBuiltinSource = {
  kind: "builtin";
  presetId: string;
  label: string;
  addedAt: number;
  channelCount?: number;
};

export type PlaylistRegistry = {
  builtins: RegisteredBuiltinSource[];
};

function readRegistry(): PlaylistRegistry {
  if (typeof window === "undefined") {
    return { builtins: [] };
  }
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return { builtins: [] };
    const parsed = JSON.parse(raw) as PlaylistRegistry;
    if (!parsed?.builtins || !Array.isArray(parsed.builtins)) {
      return { builtins: [] };
    }
    return parsed;
  } catch {
    return { builtins: [] };
  }
}

function writeRegistry(data: PlaylistRegistry): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(data));
}

export function listRegisteredBuiltins(): RegisteredBuiltinSource[] {
  return readRegistry().builtins;
}

export function getRegisteredBuiltin(
  presetId: string,
): RegisteredBuiltinSource | undefined {
  return readRegistry().builtins.find((b) => b.presetId === presetId);
}

export function upsertRegisteredBuiltin(
  entry: RegisteredBuiltinSource,
): void {
  const reg = readRegistry();
  const idx = reg.builtins.findIndex((b) => b.presetId === entry.presetId);
  if (idx >= 0) reg.builtins[idx] = entry;
  else reg.builtins.push(entry);
  writeRegistry(reg);
}

export function removeRegisteredBuiltin(presetId: string): void {
  const reg = readRegistry();
  reg.builtins = reg.builtins.filter((b) => b.presetId !== presetId);
  writeRegistry(reg);
}
