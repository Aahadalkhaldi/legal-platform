import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  updated_after: z.string().datetime().optional(),
});

export function parseSearchParams(url: string) {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  return paginationSchema.parse(params);
}
