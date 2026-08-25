export function isProtectedApiReady(input: {
  ready: boolean;
  authEnabled: boolean;
  hasUser: boolean;
}): boolean {
  return input.ready && (!input.authEnabled || input.hasUser);
}
