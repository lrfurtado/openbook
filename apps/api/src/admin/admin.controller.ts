import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  bookInputSchema,
  cardInputSchema,
  localizedSchema,
  packInputSchema,
  transitionSchema,
  type BookInput,
  type CardInput,
  type PackInput,
} from '@openbook/shared';
import { z } from 'zod';
import type { AccessClaims } from '../auth/auth.service.js';
import { AuthGuard, CurrentUser, Roles } from '../auth/guards.js';
import { ZodPipe } from '../common.js';
import { AdminService } from './admin.service.js';

const categorySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: localizedSchema,
  subcategories: z.array(z.object({ slug: z.string(), name: localizedSchema })).default([]),
});

type Transition = z.infer<typeof transitionSchema>;

/** §7.5 — CMS endpoints. Editors and publishers only. */
@Controller('admin')
@UseGuards(AuthGuard)
@Roles('editor', 'publisher')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('categories')
  categories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  createCategory(@Body(new ZodPipe(categorySchema)) body: z.infer<typeof categorySchema>) {
    return this.admin.createCategory(body);
  }

  @Get('cards')
  cards(@Query('q') q?: string) {
    return this.admin.listCards(q);
  }

  @Post('cards')
  createCard(@CurrentUser() user: AccessClaims, @Body(new ZodPipe(cardInputSchema)) body: CardInput) {
    return this.admin.createCard(user, body);
  }

  @Patch('cards/:id')
  updateCard(@CurrentUser() user: AccessClaims, @Param('id') id: string, @Body(new ZodPipe(cardInputSchema.partial())) body: Partial<CardInput>) {
    return this.admin.updateCard(user, id, body);
  }

  @Delete('cards/:id')
  deleteCard(@CurrentUser() user: AccessClaims, @Param('id') id: string) {
    return this.admin.deleteCard(user, id);
  }

  @Get('packs')
  packs() {
    return this.admin.listPacks();
  }

  @Get('packs/:id')
  pack(@Param('id') id: string) {
    return this.admin.getPack(id);
  }

  @Post('packs')
  createPack(@CurrentUser() user: AccessClaims, @Body(new ZodPipe(packInputSchema)) body: PackInput) {
    return this.admin.createPack(user, body);
  }

  @Patch('packs/:id')
  updatePack(@CurrentUser() user: AccessClaims, @Param('id') id: string, @Body(new ZodPipe(packInputSchema.partial())) body: Partial<PackInput>) {
    return this.admin.updatePack(user, id, body);
  }

  @Post('packs/:id/transition')
  @HttpCode(200)
  transitionPack(@CurrentUser() user: AccessClaims, @Param('id') id: string, @Body(new ZodPipe(transitionSchema)) body: Transition) {
    return this.admin.transitionPack(user, id, body.to);
  }

  @Get('books')
  books() {
    return this.admin.listBooks();
  }

  @Get('books/:id')
  book(@Param('id') id: string) {
    return this.admin.getBook(id);
  }

  @Post('books')
  createBook(@CurrentUser() user: AccessClaims, @Body(new ZodPipe(bookInputSchema)) body: BookInput) {
    return this.admin.createBook(user, body);
  }

  @Patch('books/:id')
  updateBook(@CurrentUser() user: AccessClaims, @Param('id') id: string, @Body(new ZodPipe(bookInputSchema)) body: BookInput) {
    return this.admin.updateBook(user, id, body);
  }

  @Post('books/:id/transition')
  @HttpCode(200)
  transitionBook(@CurrentUser() user: AccessClaims, @Param('id') id: string, @Body(new ZodPipe(transitionSchema)) body: Transition) {
    return this.admin.transitionBook(user, id, body.to);
  }
}
