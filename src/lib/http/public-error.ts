import "server-only";

/**
 * Safe messages for public JSON API bodies.
 * Never forward `Error.message`, stack traces, upstream URLs, or Prisma errors to clients.
 */
export const PUBLIC_INTERNAL_ERROR = "Request could not be completed.";
