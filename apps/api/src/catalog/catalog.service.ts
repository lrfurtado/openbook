import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BookManifest,
  BookSummary,
  Category,
  ManifestCard,
  Page,
  PackManifest,
  PackSummary,
  Rendition,
} from '@openbook/shared';
import { pickRendition } from '@openbook/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

const PAGE_SIZE = 50;
/** Rough per-image size of the 2048 rendition, used when the CMS hasn't recorded real byte counts. */
const EST_BYTES_PER_IMAGE = 450_000;

type PackWithCards = Prisma.PackGetPayload<{ include: { category: true; cards: { include: { card: true } } } }>;
type BookRow = Prisma.BookGetPayload<{ include: { category: true } }>;

const decodeCursor = (c?: string) => (c ? Math.max(0, parseInt(Buffer.from(c, 'base64url').toString(), 10) || 0) : 0);
const encodeCursor = (n: number) => Buffer.from(String(n)).toString('base64url');

export function toManifestCard(card: PackWithCards['cards'][number]['card']): ManifestCard {
  return {
    id: card.id,
    source: 'official',
    name: card.name as Record<string, string>,
    facts: card.facts as unknown as ManifestCard['facts'],
    image: { width: card.width, height: card.height, renditions: card.renditions as unknown as Rendition[] },
    attribution: card.attribution as unknown as ManifestCard['attribution'],
    updatedAt: card.updatedAt.toISOString(),
  };
}

function bytesOf(renditions: (Rendition & { bytes?: number })[]): number {
  return renditions.find((r) => r.size === 2048)?.bytes ?? EST_BYTES_PER_IMAGE;
}

export function toPackSummary(p: PackWithCards): PackSummary {
  const cards = p.cards.slice().sort((a, b) => a.position - b.position);
  const cover = cards.find((c) => c.cardId === p.coverCardId)?.card ?? cards[0]?.card;
  const coverUrl = cover ? (pickRendition(cover.renditions as unknown as Rendition[], 1024)?.url ?? '') : '';
  const licenses = [...new Set(cards.map((c) => (c.card.attribution as { license?: string } | null)?.license).filter(Boolean))];
  return {
    id: p.id,
    categoryId: p.categoryId,
    categorySlug: p.category.slug,
    subcategory: p.subcategory,
    title: p.title as Record<string, string>,
    description: p.description as Record<string, string>,
    coverUrl,
    cardCount: cards.length,
    downloadBytes: cards.reduce((n, c) => n + bytesOf(c.card.renditions as unknown as Rendition[]), 0),
    version: p.version,
    attributionSummary: `Images from Wikimedia Commons under ${licenses.join(', ')}.`,
    publishedAt: p.publishedAt?.toISOString(),
  };
}

export function toBookSummary(b: BookRow): BookSummary {
  const pages = b.pages as unknown as { image?: { renditions: Rendition[] } }[];
  const firstImage = (b.coverImage as { renditions: Rendition[] } | null) ?? pages.find((p) => p.image)?.image;
  return {
    id: b.id,
    categoryId: b.categoryId ?? undefined,
    categorySlug: b.category?.slug,
    title: b.title as Record<string, string>,
    stage: b.stage as BookSummary['stage'],
    pageCount: pages.length,
    coverUrl: firstImage ? pickRendition(firstImage.renditions, 1024)?.url : undefined,
    version: b.version,
    downloadBytes: pages.filter((p) => p.image).length * EST_BYTES_PER_IMAGE,
  };
}

const packInclude = { category: true, cards: { include: { card: true } } } as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name as Record<string, string>,
      subcategories: c.subcategories as unknown as Category['subcategories'],
    }));
  }

  async packs(q: { category?: string; subcategory?: string; cursor?: string }): Promise<Page<PackSummary>> {
    const skip = decodeCursor(q.cursor);
    const rows = await this.prisma.pack.findMany({
      where: {
        status: 'published',
        ...(q.category ? { category: { slug: q.category } } : {}),
        ...(q.subcategory ? { subcategory: q.subcategory } : {}),
      },
      include: packInclude,
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: PAGE_SIZE + 1,
    });
    return {
      items: rows.slice(0, PAGE_SIZE).map(toPackSummary),
      nextCursor: rows.length > PAGE_SIZE ? encodeCursor(skip + PAGE_SIZE) : null,
    };
  }

  private async publishedPack(id: string) {
    const pack = await this.prisma.pack.findFirst({ where: { id, status: 'published' }, include: packInclude });
    if (!pack) throw new NotFoundException('Pack not found');
    return pack;
  }

  async pack(id: string): Promise<PackSummary> {
    return toPackSummary(await this.publishedPack(id));
  }

  async packManifest(id: string): Promise<PackManifest> {
    const pack = await this.publishedPack(id);
    const cards = pack.cards.slice().sort((a, b) => a.position - b.position);
    return { pack: toPackSummary(pack), cardIds: cards.map((c) => c.cardId), cards: cards.map((c) => toManifestCard(c.card)) };
  }

  async books(q: { category?: string; stage?: string; cursor?: string }): Promise<Page<BookSummary>> {
    const skip = decodeCursor(q.cursor);
    const rows = await this.prisma.book.findMany({
      where: {
        status: 'published',
        ...(q.category ? { category: { slug: q.category } } : {}),
        ...(q.stage ? { stage: Number(q.stage) } : {}),
      },
      include: { category: true },
      orderBy: [{ stage: 'asc' }, { publishedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: PAGE_SIZE + 1,
    });
    return {
      items: rows.slice(0, PAGE_SIZE).map(toBookSummary),
      nextCursor: rows.length > PAGE_SIZE ? encodeCursor(skip + PAGE_SIZE) : null,
    };
  }

  private async publishedBook(id: string) {
    const book = await this.prisma.book.findFirst({ where: { id, status: 'published' }, include: { category: true } });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  async book(id: string): Promise<BookSummary> {
    return toBookSummary(await this.publishedBook(id));
  }

  async bookManifest(id: string): Promise<BookManifest> {
    const b = await this.publishedBook(id);
    return {
      book: toBookSummary(b),
      data: {
        id: b.id,
        source: 'official',
        categoryId: b.categoryId ?? undefined,
        title: b.title as Record<string, string>,
        stage: b.stage as BookManifest['data']['stage'],
        layout: b.layout as BookManifest['data']['layout'],
        coverImage: (b.coverImage ?? undefined) as BookManifest['data']['coverImage'],
        pages: b.pages as unknown as BookManifest['data']['pages'],
        vocabulary: b.vocabulary,
        showEndPage: b.showEndPage,
        version: b.version,
        status: 'published',
        containsPrivatePhotos: false,
        updatedAt: b.updatedAt.toISOString(),
      },
    };
  }
}
