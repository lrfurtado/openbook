import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BookManifest, BookSummary, Category, Page, PackManifest, PackSummary } from '@openbook/shared';
import { API_URL } from '@/lib/config';

/** RTK Query client for the public catalog (§7.2). No account needed (FR-6). */
export const catalogApi = createApi({
  reducerPath: 'catalogApi',
  baseQuery: fetchBaseQuery({ baseUrl: API_URL }),
  endpoints: (build) => ({
    categories: build.query<Category[], void>({ query: () => 'catalog/categories' }),
    packs: build.query<Page<PackSummary>, { category?: string } | void>({
      query: (args) => ({ url: 'catalog/packs', params: args ?? {} }),
    }),
    pack: build.query<PackSummary, string>({ query: (id) => `catalog/packs/${id}` }),
    packManifest: build.query<PackManifest, { id: string; version: number }>({
      query: ({ id, version }) => ({ url: `catalog/packs/${id}/manifest`, params: { v: version } }),
    }),
    books: build.query<Page<BookSummary>, { category?: string; stage?: number } | void>({
      query: (args) => ({ url: 'catalog/books', params: args ?? {} }),
    }),
    book: build.query<BookSummary, string>({ query: (id) => `catalog/books/${id}` }),
    bookManifest: build.query<BookManifest, { id: string; version: number }>({
      query: ({ id, version }) => ({ url: `catalog/books/${id}/manifest`, params: { v: version } }),
    }),
  }),
});

export const {
  useCategoriesQuery,
  usePacksQuery,
  usePackQuery,
  useBooksQuery,
  useBookQuery,
  useBookManifestQuery,
} = catalogApi;
