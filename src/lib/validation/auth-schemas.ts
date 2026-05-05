import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, or hyphens.");

export const passwordSchema = z.string().min(8).max(256);
