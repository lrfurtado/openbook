import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

/** Public, anonymous, cacheable catalog (§7.2, FR-6). */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=300')
  categories() {
    return this.catalog.categories();
  }

  @Get('packs')
  @Header('Cache-Control', 'public, max-age=60')
  packs(@Query('category') category?: string, @Query('subcategory') subcategory?: string, @Query('cursor') cursor?: string) {
    return this.catalog.packs({ category, subcategory, cursor });
  }

  @Get('packs/:id')
  @Header('Cache-Control', 'public, max-age=60')
  pack(@Param('id') id: string) {
    return this.catalog.pack(id);
  }

  // `?v=` only varies the cache key; the response is always the current published version.
  @Get('packs/:id/manifest')
  @Header('Cache-Control', 'public, max-age=300')
  packManifest(@Param('id') id: string) {
    return this.catalog.packManifest(id);
  }

  @Get('books')
  @Header('Cache-Control', 'public, max-age=60')
  books(@Query('category') category?: string, @Query('stage') stage?: string, @Query('cursor') cursor?: string) {
    return this.catalog.books({ category, stage, cursor });
  }

  @Get('books/:id')
  @Header('Cache-Control', 'public, max-age=60')
  book(@Param('id') id: string) {
    return this.catalog.book(id);
  }

  @Get('books/:id/manifest')
  @Header('Cache-Control', 'public, max-age=300')
  bookManifest(@Param('id') id: string) {
    return this.catalog.bookManifest(id);
  }
}
