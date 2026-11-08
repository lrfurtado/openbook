// Loads content/seed.json (built by scripts/fetch-content.mjs) into the database as published packs and
// official books, plus dev CMS accounts. Idempotent: rows are matched on their content `key`.
import argon2 from 'argon2';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateBookFromCards, validateBook, validatePack, type Attribution, type BookStage, type Rendition } from '@openbook/shared';
import { newId } from './common.js';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';
import { createPrismaClient } from './prisma.service.js';

interface SeedCard {
  key: string;
  name: Record<string, string>;
  facts: { level: 1 | 2 | 3; text: Record<string, string> }[];
  image: { width: number; height: number; renditions: Rendition[] };
  attribution: Attribution;
}

interface SeedFile {
  categories: { slug: string; name: string; subcategories: { slug: string; name: string }[] }[];
  packs: { key: string; category: string; subcategory: string; title: string; description: string; cards: SeedCard[] }[];
  books: { key: string; pack: string; title: string; stage: BookStage; cards: number; offset?: number }[];
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** JSON with sorted keys: jsonb columns don't preserve key order. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

/** Keeps the page ids already published so a re-seed doesn't change page identity. */
function stripIds<T extends { id: string }>(pages: T[], existing: unknown): T[] {
  const old = (existing as { id: string }[] | null) ?? [];
  return pages.map((p, i) => ({ ...p, id: old[i]?.id ?? p.id }));
}

export async function seed(prisma: PrismaClient, log: (m: string) => void = console.log) {
  const file = process.env.OPENBOOK_SEED_FILE ?? fileURLToPath(new URL('../../../content/seed.json', import.meta.url));
  const data = JSON.parse(await readFile(file, 'utf8')) as SeedFile;

  const categoryIds = new Map<string, string>();
  for (const [i, c] of data.categories.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: {
        id: newId(), slug: c.slug, name: { en: c.name }, sortOrder: i,
        subcategories: json(c.subcategories.map((s) => ({ slug: s.slug, name: { en: s.name } }))),
      },
      update: { name: { en: c.name }, sortOrder: i, subcategories: json(c.subcategories.map((s) => ({ slug: s.slug, name: { en: s.name } }))) },
    });
    categoryIds.set(c.slug, row.id);
  }

  const cardIdsByPack = new Map<string, { id: string; card: SeedCard }[]>();
  for (const p of data.packs) {
    const problems = validatePack(p.cards.map((c) => ({ id: c.key, ...c })));
    if (problems.length) throw new Error(`Pack ${p.key} failed validation:\n${problems.join('\n')}`);
    const cards: { id: string; card: SeedCard }[] = [];
    let changed = false;
    for (const c of p.cards) {
      const fields = {
        name: c.name, facts: json(c.facts), width: c.image.width, height: c.image.height,
        renditions: json(c.image.renditions), attribution: json(c.attribution), deletedAt: null,
      };
      const before = await prisma.card.findUnique({ where: { key: c.key } });
      const same =
        before &&
        stable([before.name, before.facts, before.width, before.height, before.renditions, before.attribution]) ===
          stable([fields.name, fields.facts, fields.width, fields.height, fields.renditions, fields.attribution]);
      if (!same) changed = true;
      const row = same ? before : await prisma.card.upsert({ where: { key: c.key }, create: { id: newId(), key: c.key, ...fields }, update: fields });
      cards.push({ id: row.id, card: c });
    }
    cardIdsByPack.set(p.key, cards);

    const existing = await prisma.pack.findUnique({ where: { key: p.key } });
    const packId = existing?.id ?? newId();
    const fields = {
      categoryId: categoryIds.get(p.category)!, subcategory: p.subcategory,
      title: { en: p.title }, description: { en: p.description }, coverCardId: cards[0].id,
    };
    await prisma.$transaction(async (tx) => {
      if (existing) {
        // Changed content gets a new version so clients (and HTTP caches keyed on ?v=) pick it up (FR-4).
        await tx.pack.update({ where: { id: packId }, data: { ...fields, ...(changed ? { version: { increment: 1 }, publishedAt: new Date() } : {}) } });
        await tx.packCard.deleteMany({ where: { packId } });
      } else {
        await tx.pack.create({ data: { id: packId, key: p.key, ...fields, status: 'published', version: 1, publishedAt: new Date() } });
      }
      await tx.packCard.createMany({ data: cards.map((c, position) => ({ packId, cardId: c.id, position })) });
    });
    log(`pack ${p.key}: ${cards.length} cards`);
  }

  for (const b of data.books) {
    const existingBook = await prisma.book.findUnique({ where: { key: b.key } });
    const pack = data.packs.find((p) => p.key === b.pack)!;
    const offset = b.offset ?? 0;
    const cards = cardIdsByPack.get(b.pack)!.slice(offset, offset + b.cards);
    const book = generateBookFromCards({
      cards: cards.map(({ id, card }) => ({ id, ...card })),
      title: b.title,
      stage: b.stage,
      newId,
      now: new Date().toISOString(),
    });
    const issues = validateBook(book);
    if (issues.length) throw new Error(`Book ${b.key} failed validation:\n${issues.map((i) => i.message).join('\n')}`);
    const fields = {
      categoryId: categoryIds.get(pack.category), title: book.title, stage: book.stage,
      layout: book.layout, showEndPage: true, pages: json(book.pages), vocabulary: book.vocabulary,
    };
    if (existingBook) {
      // Re-seeding refreshes content (e.g. new image URLs) and bumps the version so devices update.
      if (stable(existingBook.pages) === stable(stripIds(book.pages, existingBook.pages))) continue;
      await prisma.book.update({
        where: { id: existingBook.id },
        data: { ...fields, pages: json(stripIds(book.pages, existingBook.pages)), version: { increment: 1 }, publishedAt: new Date() },
      });
    } else {
      await prisma.book.create({ data: { id: newId(), key: b.key, ...fields, status: 'published', version: 1, publishedAt: new Date() } });
    }
    log(`book ${b.key}: ${book.pages.length} pages`);
  }

  // Production installs never get CMS accounts with the well-known dev password.
  const password = process.env.SEED_ADMIN_PASSWORD ?? (process.env.NODE_ENV === 'production' ? null : 'openbook-dev-password');
  if (!password) {
    log('skipping CMS accounts: set SEED_ADMIN_PASSWORD to create editor@ and publisher@openbook.local');
    return;
  }
  for (const role of ['editor', 'publisher'] as const) {
    const email = `${role}@openbook.local`;
    if (await prisma.user.findUnique({ where: { email } })) continue;
    await prisma.user.create({
      data: { id: newId(), email, role, emailVerifiedAt: new Date(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
    });
    log(`user ${email} (${role})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = createPrismaClient();
  await seed(prisma);
  await prisma.$disconnect();
}
