export type AppUserRole = "ADMIN" | "USER";

export function canMutateSystem(
  authEnabled: boolean,
  role?: AppUserRole,
): boolean {
  return !authEnabled || role === "ADMIN";
}
