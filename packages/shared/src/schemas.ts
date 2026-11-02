import { z } from 'zod';

export const localizedSchema = z.record(z.string(), z.string());

export const renditionSchema = z.object({
  size: z.union([z.literal(1024), z.literal(2048), z.literal(3072)]),
  url: z.string().url(),
  format: z.enum(['webp', 'jpeg']),
  bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
});

export const attributionSchema = z.object({
  author: z.string().min(1),
  sourceUrl: z.string().url(),
  license: z.string().min(1),
  licenseUrl: z.string().url(),
});

export const factSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: localizedSchema,
});

export const manifestCardSchema = z.object({
  id: z.string(),
  source: z.literal('official'),
  name: localizedSchema,
  facts: z.array(factSchema),
  image: z.object({ width: z.number(), height: z.number(), renditions: z.array(renditionSchema).min(1) }),
  attribution: attributionSchema,
  updatedAt: z.string(),
});

export const packSummarySchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  categorySlug: z.string(),
  subcategory: z.string(),
  title: localizedSchema,
  description: localizedSchema,
  coverUrl: z.string(),
  cardCount: z.number().int(),
  downloadBytes: z.number().int(),
  version: z.number().int(),
  attributionSummary: z.string(),
  publishedAt: z.string().optional(),
});

export const packManifestSchema = z.object({
  pack: packSummarySchema,
  cardIds: z.array(z.string()),
  cards: z.array(manifestCardSchema),
});

const bookImageSchema = z.object({
  renditions: z.array(renditionSchema),
  attribution: attributionSchema.optional(),
});

export const bookInputSchema = z.object({
  categoryId: z.string().optional(),
  title: localizedSchema,
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  layout: z.enum(['text-then-picture', 'text-only', 'side-by-side']).default('text-then-picture'),
  showEndPage: z.boolean().default(true),
  coverImage: bookImageSchema.optional(),
  pages: z.array(
    z.object({
      id: z.string().optional(),
      text: localizedSchema,
      image: bookImageSchema.optional(),
      cardId: z.string().optional(),
    }),
  ),
});

// ---- Admin inputs (§7.5) ----

export const cardInputSchema = z.object({
  name: localizedSchema,
  facts: z.array(factSchema).default([]),
  image: z.object({ width: z.number().int(), height: z.number().int(), renditions: z.array(renditionSchema).min(1) }),
  attribution: attributionSchema.partial().optional(),
});

export const packInputSchema = z.object({
  categoryId: z.string(),
  subcategory: z.string(),
  title: localizedSchema,
  description: localizedSchema.default({}),
  coverCardId: z.string().optional(),
  cardIds: z.array(z.string()).default([]),
});

export const transitionSchema = z.object({ to: z.enum(['draft', 'review', 'published', 'archived']) });

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export type CardInput = z.infer<typeof cardInputSchema>;
export type PackInput = z.infer<typeof packInputSchema>;
export type BookInput = z.infer<typeof bookInputSchema>;
