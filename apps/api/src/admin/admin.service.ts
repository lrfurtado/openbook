import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  attributionComplete,
  bookVocabulary,
  canTransition,
  validateBook,
  validatePack,
  type BookInput,
  type CardForValidation,
  type CardInput,
  type PackInput,
  type PublishStatus,
} from '@openbook/shared';
import type { AccessClaims } from '../auth/auth.service.js';
import { newId } from '../common.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private audit(user: AccessClaims, action: string, entity: string, entityId: string, data?: unknown) {
    return this.prisma.auditLog.create({ data: { id: newId(), userId: user.sub, action, entity, entityId, data: json(data ?? null) } });
  }

  // ---- Categories ----

  listCategories() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  createCategory(body: { slug: string; name: Record<string, string>; subcategories: { slug: string; name: Record<string, string> }[] }) {
    return this.prisma.category.create({ data: { id: newId(), slug: body.slug, name: body.name, subcategories: json(body.subcategories) } });
  }

  // ---- Cards ----

  listCards(q?: string) {
    return this.prisma.card.findMany({
      where: { deletedAt: null, ...(q ? { key: { contains: q, mode: 'insensitive' as const } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createCard(user: AccessClaims, body: CardInput) {
    const card = await this.prisma.card.create({
      data: {
        id: newId(),
        name: body.name,
        facts: json(body.facts),
        width: body.image.width,
        height: body.image.height,
        renditions: json(body.image.renditions),
        attribution: json(body.attribution ?? null),
      },
    });
    await this.audit(user, 'create', 'card', card.id);
    return card;
  }

  async updateCard(user: AccessClaims, id: string, body: Partial<CardInput>) {
    await this.getCard(id);
    const card = await this.prisma.card.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.facts ? { facts: json(body.facts) } : {}),
        ...(body.image ? { width: body.image.width, height: body.image.height, renditions: json(body.image.renditions) } : {}),
        ...(body.attribution ? { attribution: json(body.attribution) } : {}),
      },
    });
    await this.audit(user, 'update', 'card', id);
    return card;
  }

  async deleteCard(user: AccessClaims, id: string) {
    await this.getCard(id);
    await this.prisma.card.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(user, 'delete', 'card', id);
    return { ok: true };
  }

  private async getCard(id: string) {
    const card = await this.prisma.card.findFirst({ where: { id, deletedAt: null } });
    if (!card) throw new NotFoundException('Card not found');
    return card;
  }

  // ---- Packs ----

  listPacks() {
    return this.prisma.pack.findMany({ include: { category: true, _count: { select: { cards: true } } }, orderBy: { createdAt: 'asc' } });
  }

  async getPack(id: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: { cards: { include: { card: true }, orderBy: { position: 'asc' } } },
    });
    if (!pack) throw new NotFoundException('Pack not found');
    return pack;
  }

  async createPack(user: AccessClaims, body: PackInput) {
    const id = newId();
    await this.prisma.pack.create({
      data: {
        id,
        categoryId: body.categoryId,
        subcategory: body.subcategory,
        title: body.title,
        description: body.description,
        coverCardId: body.coverCardId ?? body.cardIds[0],
        cards: { create: body.cardIds.map((cardId, position) => ({ cardId, position })) },
      },
    });
    await this.audit(user, 'create', 'pack', id);
    return this.getPack(id);
  }

  async updatePack(user: AccessClaims, id: string, body: Partial<PackInput>) {
    const pack = await this.getPack(id);
    if (pack.status !== 'draft') throw new BadRequestException('Only draft packs can be edited; move it back to draft first');
    await this.prisma.$transaction(async (tx) => {
      await tx.pack.update({
        where: { id },
        data: {
          ...(body.categoryId ? { categoryId: body.categoryId } : {}),
          ...(body.subcategory ? { subcategory: body.subcategory } : {}),
          ...(body.title ? { title: body.title } : {}),
          ...(body.description ? { description: body.description } : {}),
          ...(body.coverCardId ? { coverCardId: body.coverCardId } : {}),
        },
      });
      if (body.cardIds) {
        await tx.packCard.deleteMany({ where: { packId: id } });
        await tx.packCard.createMany({ data: body.cardIds.map((cardId, position) => ({ packId: id, cardId, position })) });
      }
    });
    await this.audit(user, 'update', 'pack', id);
    return this.getPack(id);
  }

  private assertTransition(user: AccessClaims, from: PublishStatus, to: PublishStatus) {
    if (!canTransition(from, to)) throw new BadRequestException(`Cannot move from ${from} to ${to}`);
    // FR-54: editors move drafts in and out of review; publishing and archiving need a publisher.
    if ((to === 'published' || to === 'archived') && user.role !== 'publisher') throw new ForbiddenException('Publisher role required');
  }

  /** FR-56/57: status workflow with validation; publishing bumps the version. */
  async transitionPack(user: AccessClaims, id: string, to: PublishStatus) {
    const pack = await this.getPack(id);
    this.assertTransition(user, pack.status, to);
    if (to === 'review' || to === 'published') {
      const problems = validatePack(
        pack.cards
          .filter((pc) => !pc.card.deletedAt)
          .map(({ card }): CardForValidation => ({
            id: card.id,
            name: card.name as Record<string, string>,
            facts: card.facts as unknown as CardForValidation['facts'],
            image: { width: card.width, height: card.height },
            attribution: card.attribution as CardForValidation['attribution'],
          })),
      );
      if (problems.length) throw new UnprocessableEntityException({ message: 'Pack failed validation', problems });
    }
    await this.prisma.pack.update({
      where: { id },
      data: { status: to, ...(to === 'published' ? { version: { increment: 1 }, publishedAt: new Date() } : {}) },
    });
    await this.audit(user, `transition:${to}`, 'pack', id, { from: pack.status });
    return this.getPack(id);
  }

  // ---- Books ----

  listBooks() {
    return this.prisma.book.findMany({ include: { category: true }, orderBy: { createdAt: 'asc' } });
  }

  async getBook(id: string) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  private bookData(body: BookInput) {
    const pages = body.pages.map((p) => ({ ...p, id: p.id ?? newId() }));
    return {
      categoryId: body.categoryId ?? null,
      title: body.title,
      stage: body.stage,
      layout: body.layout,
      showEndPage: body.showEndPage,
      coverImage: json(body.coverImage ?? null),
      pages: json(pages),
      vocabulary: bookVocabulary({ title: body.title, pages }),
    };
  }

  async createBook(user: AccessClaims, body: BookInput) {
    const id = newId();
    await this.prisma.book.create({ data: { id, ...this.bookData(body) } });
    await this.audit(user, 'create', 'book', id);
    return this.getBook(id);
  }

  async updateBook(user: AccessClaims, id: string, body: BookInput) {
    const book = await this.getBook(id);
    if (book.status !== 'draft') throw new BadRequestException('Only draft books can be edited');
    await this.prisma.book.update({ where: { id }, data: this.bookData(body) });
    await this.audit(user, 'update', 'book', id);
    return this.getBook(id);
  }

  /** FR-59/63: official books are blocked (not just warned) when they break stage rules. */
  async transitionBook(user: AccessClaims, id: string, to: PublishStatus) {
    const book = await this.getBook(id);
    this.assertTransition(user, book.status, to);
    if (to === 'review' || to === 'published') {
      const pages = book.pages as unknown as BookInput['pages'];
      const problems = validateBook({ stage: book.stage as BookInput['stage'], pages: pages.map((p, i) => ({ ...p, id: p.id ?? String(i) })) }).map((i) => i.message);
      pages.forEach((p, i) => {
        if (p.image && !attributionComplete(p.image.attribution)) problems.push(`Page ${i + 1}: image attribution incomplete`);
      });
      if (problems.length) throw new UnprocessableEntityException({ message: 'Book failed validation', problems });
    }
    await this.prisma.book.update({
      where: { id },
      data: { status: to, ...(to === 'published' ? { version: { increment: 1 }, publishedAt: new Date() } : {}) },
    });
    await this.audit(user, `transition:${to}`, 'book', id, { from: book.status });
    return this.getBook(id);
  }
}
