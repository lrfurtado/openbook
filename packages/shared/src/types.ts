// Domain entities (SPECS §6). Shared by the mobile client and the API.

export type ID = string; // UUID v7
export type Localized = Record<string, string>; // { en: "Bald Eagle" }
export type ISODate = string; // "YYYY-MM-DD" (local calendar date)
export type ISODateTime = string;

export type PublishStatus = 'draft' | 'review' | 'published' | 'archived';
export type FactLevel = 1 | 2 | 3;
export type RenditionSize = 1024 | 2048 | 3072;

export interface Rendition {
  size: RenditionSize;
  url: string;
  format: 'webp' | 'jpeg';
}

export interface Attribution {
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

export interface Category {
  id: ID;
  slug: 'nature-science' | 'everyday-objects' | string;
  name: Localized;
  subcategories: { slug: string; name: Localized }[];
}

export interface Pack {
  id: ID;
  categoryId: ID;
  subcategory: string;
  title: Localized;
  description: Localized;
  coverCardId: ID;
  version: number;
  status: PublishStatus;
  cardIds: ID[];
  publishedAt?: ISODateTime;
}

export interface CardFact {
  level: FactLevel;
  text: Localized;
}

export interface CardImage {
  renditions: Rendition[];
  localPath?: string; // client only
  width: number;
  height: number;
}

export interface Card {
  id: ID;
  source: 'official' | 'user';
  ownerUserId?: ID;
  name: Localized;
  facts: CardFact[];
  image: CardImage;
  attribution?: Attribution;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export interface CustomDeck {
  id: ID;
  ownerUserId?: ID;
  title: string;
  cardIds: ID[];
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export type NameDisplay = 'hidden' | 'below' | 'after';
export type BookLayout = 'text-then-picture' | 'text-only' | 'side-by-side';

export interface ChildSettings {
  nameDisplay: NameDisplay;
  factCaption: boolean;
  sessionSize: number; // 5..20
  secondsPerCard: number; // 0.5..30
  audio: boolean;
  daysPerSet: number; // 1..10
  sessionsPerDay: number;
  maxActiveSets: number; // 1..5
  reminderTimes: string[]; // "HH:MM"
  remindersEnabled: boolean;
  bookLayout: BookLayout;
  readingsPerDay: number;
  daysPerBook: number;
  maxActiveBooks: number;
  pageAutoAdvanceSeconds: number | null; // null = manual, 2..10
}

export interface ChildProfile {
  id: ID;
  ownerUserId?: ID;
  nickname: string;
  avatar: string;
  birthMonth?: string; // "YYYY-MM"
  settings: ChildSettings;
  /** Set when a set retired and its source had no unseen cards left (FR-34). */
  chooseNewSource?: boolean;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export type SourceType = 'pack' | 'deck';

export interface ActiveSet {
  id: ID;
  childId: ID;
  sourceType: SourceType;
  sourceId: ID;
  cardIds: ID[];
  startedOn: ISODate;
  activeDays: ISODate[];
  /** Extra active days added by the parent (FR-38). */
  extraDays: number;
  status: 'active' | 'retired';
  retiredOn?: ISODate;
  updatedAt: ISODateTime;
}

export interface CardProgress {
  childId: ID;
  cardId: ID;
  cycles: number;
  factLevel: FactLevel;
  lastShownAt?: ISODateTime;
}

export interface SessionLog {
  id: ID;
  childId: ID;
  type: 'flash' | 'reading';
  setId?: ID;
  activeBookId?: ID;
  bookId?: ID;
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  cardIdsShown?: ID[];
  pagesShown?: number;
  completed: boolean;
}

export interface BookImage {
  renditions: Rendition[];
  localPath?: string;
  attribution?: Attribution;
}

export interface BookPage {
  id: ID;
  text: Localized;
  image?: BookImage;
  cardId?: ID;
  voiceRecordingId?: ID;
}

export type BookStage = 1 | 2 | 3 | 4;

export interface Book {
  id: ID;
  source: 'official' | 'homemade' | 'generated';
  ownerUserId?: ID;
  categoryId?: ID;
  title: Localized;
  stage: BookStage;
  layout: BookLayout;
  coverImage?: BookImage;
  pages: BookPage[];
  vocabulary: string[];
  generatedFrom?: { sourceType: SourceType; sourceId: ID; cardIds: ID[] };
  templateKey?: string;
  showEndPage: boolean;
  version: number;
  status?: PublishStatus;
  containsPrivatePhotos: boolean;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

export interface ActiveBook {
  id: ID;
  childId: ID;
  bookId: ID;
  startedOn: ISODate;
  activeDays: ISODate[];
  extraDays: number;
  status: 'active' | 'retired';
  retiredOn?: ISODate;
  updatedAt: ISODateTime;
}

export interface KnownWord {
  childId: ID;
  word: string;
  addedAt: ISODateTime;
  source: 'manual' | 'book';
  bookId?: ID;
}

// ---- Catalog API payloads (§7.2) ----

export interface PackSummary {
  id: ID;
  categoryId: ID;
  categorySlug: string;
  subcategory: string;
  title: Localized;
  description: Localized;
  coverUrl: string;
  cardCount: number;
  downloadBytes: number;
  version: number;
  attributionSummary: string;
  publishedAt?: ISODateTime;
}

export interface ManifestCard extends Omit<Card, 'image'> {
  image: {
    width: number;
    height: number;
    renditions: (Rendition & { bytes?: number; sha256?: string })[];
  };
}

export interface PackManifest {
  pack: PackSummary;
  cardIds: ID[];
  cards: ManifestCard[];
}

export interface BookSummary {
  id: ID;
  categoryId?: ID;
  categorySlug?: string;
  title: Localized;
  stage: BookStage;
  pageCount: number;
  coverUrl?: string;
  version: number;
  downloadBytes: number;
}

export interface BookManifest {
  book: BookSummary;
  data: Book;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
