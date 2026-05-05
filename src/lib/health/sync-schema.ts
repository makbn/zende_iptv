import { z } from "zod";

export const syncBodySchema = z.object({
  entries: z
    .array(
      z.object({
        url: z.string().min(4).max(4096),
        label: z.string().max(512).optional(),
        presetId: z.string().max(128).optional(),
      }),
    )
    .max(50_000),
});

export type SyncBody = z.infer<typeof syncBodySchema>;
