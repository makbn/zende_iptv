"use client";

let activeScope = "pending";

export function setPersonalDataScope(scope: string | null): void {
  activeScope = scope?.trim() || "anonymous";
}

export function getPersonalDataScope(): string {
  return activeScope;
}

export function personalDataStorageKey(namespace: string): string {
  return `${namespace}.${activeScope}`;
}
