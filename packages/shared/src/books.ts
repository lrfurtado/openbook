import { BOOK_BLACK, NAME_RED } from './defaults';
import type { Book, BookLayout, BookPage, BookStage, Card, ID, KnownWord, SourceType } from './types';
import { loc } from './util';

// ---- Stages (FR-63) ----

export interface StageRule {
  color: string;
  /** Minimum x-height as a fraction of page height. */
  minXHeight: number;
  maxWordsPerPage: number;
  maxPages: number;
}

export const STAGE_RULES: Record<BookStage, StageRule> = {
  1: { color: NAME_RED, minXHeight: 0.15, maxWordsPerPage: 5, maxPages: 12 },
  2: { color: NAME_RED, minXHeight: 0.1, maxWordsPerPage: 10, maxPages: 16 },
  3: { color: BOOK_BLACK, minXHeight: 0.06, maxWordsPerPage: 20, maxPages: 24 },
  4: { color: BOOK_BLACK, minXHeight: 0.04, maxWordsPerPage: 40, maxPages: 32 },
};

/** x-height / font-size for the bundled sans-serif stack (system UI fonts sit around 0.52–0.54). */
export const X_HEIGHT_RATIO = 0.52;

export function minFontSize(stage: BookStage, pageHeight: number): number {
  return (STAGE_RULES[stage].minXHeight * pageHeight) / X_HEIGHT_RATIO;
}

// ---- Vocabulary (FR-74, §9.3) ----

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const out: string[] = [];
    for (const s of new Seg('en', { granularity: 'word' }).segment(text)) if (s.isWordLike) out.push(s.segment);
    return out;
  }
  return text.match(WORD_RE) ?? [];
}

export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

export function extractVocabulary(texts: readonly string[]): string[] {
  const words = new Set<string>();
  for (const t of texts) for (const w of tokenize(t)) {
    const n = normalizeWord(w);
    if (n) words.add(n);
  }
  return [...words].sort();
}

export function bookVocabulary(book: Pick<Book, 'title' | 'pages'>, lang = 'en'): string[] {
  return extractVocabulary([loc(book.title, lang), ...book.pages.map((p) => loc(p.text, lang))]);
}

export interface Readiness {
  percent: number; // 0..100
  known: string[];
  newWords: string[];
}

/** FR-75 — informational only, never blocks reading. */
export function readiness(vocabulary: readonly string[], known: readonly Pick<KnownWord, 'word'>[]): Readiness {
  const knownSet = new Set(known.map((k) => k.word));
  const k = vocabulary.filter((w) => knownSet.has(w));
  const n = vocabulary.filter((w) => !knownSet.has(w));
  return { percent: vocabulary.length ? Math.round((k.length / vocabulary.length) * 100) : 100, known: k, newWords: n };
}

// ---- Validation (FR-63) ----

export interface StageIssue {
  pageIndex: number | null; // null = whole book
  code: 'too-many-words' | 'too-many-pages' | 'empty-text' | 'does-not-fit';
  message: string;
}

export function validateBook(book: Pick<Book, 'stage' | 'pages'>, lang = 'en'): StageIssue[] {
  const rule = STAGE_RULES[book.stage];
  const issues: StageIssue[] = [];
  if (book.pages.length > rule.maxPages) {
    issues.push({
      pageIndex: null,
      code: 'too-many-pages',
      message: `Stage ${book.stage} books have at most ${rule.maxPages} pages (this one has ${book.pages.length}).`,
    });
  }
  book.pages.forEach((p, i) => {
    const text = loc(p.text, lang).trim();
    if (!text) {
      issues.push({ pageIndex: i, code: 'empty-text', message: `Page ${i + 1} has no text.` });
      return;
    }
    const words = countWords(text);
    if (words > rule.maxWordsPerPage) {
      issues.push({
        pageIndex: i,
        code: 'too-many-words',
        message: `Page ${i + 1} has ${words} words; stage ${book.stage} allows ${rule.maxWordsPerPage}.`,
      });
    }
  });
  return issues;
}

// ---- Reader page sequence (§9.3, FR-65/66, AC-10) ----

export type ReaderPage =
  | { kind: 'cover' }
  | { kind: 'text'; pageIndex: number }
  | { kind: 'picture'; pageIndex: number }
  | { kind: 'spread'; pageIndex: number }
  | { kind: 'end' };

export function pageSequence(book: Pick<Book, 'pages' | 'showEndPage'>, layout: BookLayout): ReaderPage[] {
  const seq: ReaderPage[] = [{ kind: 'cover' }];
  book.pages.forEach((p, i) => {
    const hasImage = !!p.image;
    if (layout === 'side-by-side' && hasImage) seq.push({ kind: 'spread', pageIndex: i });
    else {
      seq.push({ kind: 'text', pageIndex: i });
      if (layout === 'text-then-picture' && hasImage) seq.push({ kind: 'picture', pageIndex: i });
    }
  });
  if (book.showEndPage) seq.push({ kind: 'end' });
  return seq;
}

// ---- Text auto-fit (§9.3, AC-11) ----

export type MeasureText = (text: string, fontSize: number) => number;

/** Letter spacing used by the reader and print, in em (FR-64: generous spacing). */
export const LETTER_SPACING_EM = 0.04;

/** Approximate width of semibold sans-serif text: ~0.62 em per glyph plus letter spacing. */
export const estimateTextWidth: MeasureText = (text, fontSize) => text.length * fontSize * (0.62 + LETTER_SPACING_EM);

export function wrapLines(text: string, fontSize: number, maxWidth: number, measure: MeasureText): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (!line || measure(candidate, fontSize) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface FitResult {
  fontSize: number;
  fits: boolean;
  lines: string[];
}

export const LINE_HEIGHT = 1.2;

/**
 * Binary-searches the largest font size whose wrapped text fits 80% of the page width and 70% of its
 * height, never going below the stage minimum. `fits=false` means the text overflows even at the minimum.
 */
export function fitText(
  text: string,
  pageWidth: number,
  pageHeight: number,
  stage: BookStage,
  measure: MeasureText = estimateTextWidth,
): FitResult {
  const maxW = pageWidth * 0.8;
  const maxH = pageHeight * 0.7;
  const min = minFontSize(stage, pageHeight);
  const fitsAt = (size: number) => {
    const lines = wrapLines(text, size, maxW, measure);
    const widest = Math.max(0, ...lines.map((l) => measure(l, size)));
    return widest <= maxW && lines.length * size * LINE_HEIGHT <= maxH;
  };
  if (!fitsAt(min)) return { fontSize: Math.ceil(min), fits: false, lines: wrapLines(text, min, maxW, measure) };
  let lo = min;
  let hi = Math.max(min, maxH / LINE_HEIGHT);
  for (let i = 0; i < 24 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(mid)) lo = mid;
    else hi = mid;
  }
  const fontSize = Math.floor(lo);
  return { fontSize: Math.max(fontSize, Math.ceil(min)), fits: true, lines: wrapLines(text, fontSize, maxW, measure) };
}

// ---- Generate from cards (FR-62, §9.3) ----

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

export interface GenerateParams {
  cards: readonly Pick<Card, 'id' | 'name' | 'facts' | 'image' | 'attribution'>[];
  stage?: BookStage;
  title: string;
  source?: { sourceType: SourceType; sourceId: ID };
  newId: () => ID;
  now: string;
  /** Resolves a card's local image path. */
  localImage?: (cardId: ID) => string | undefined;
  lang?: string;
}

export function generateBookFromCards(p: GenerateParams): Book {
  const stage = p.stage ?? 1;
  const lang = p.lang ?? 'en';
  const pages: BookPage[] = [];
  for (const c of p.cards) {
    const name = loc(c.name, lang).toLowerCase();
    pages.push({
      id: p.newId(),
      text: { [lang]: `This is ${article(name)} ${name}.` },
      cardId: c.id,
      image: { renditions: c.image.renditions, localPath: p.localImage?.(c.id), attribution: c.attribution },
    });
    const fact = c.facts.find((f) => f.level === 1);
    if (stage >= 2 && fact) pages.push({ id: p.newId(), text: { [lang]: sentence(loc(fact.text, lang)) }, cardId: c.id });
  }
  return finalizeBook({
    id: p.newId(),
    source: 'generated',
    title: { [lang]: p.title },
    stage,
    layout: 'text-then-picture',
    pages,
    vocabulary: [],
    generatedFrom: p.source ? { ...p.source, cardIds: p.cards.map((c) => c.id) } : undefined,
    showEndPage: true,
    version: 1,
    containsPrivatePhotos: false,
    updatedAt: p.now,
  });
}

/** Recomputes derived fields; call on every save. */
export function finalizeBook(book: Book): Book {
  return { ...book, vocabulary: bookVocabulary(book) };
}

// ---- Templates (FR-61) ----

export interface BookTemplate {
  key: string;
  title: string;
  pages: string[];
}

export const NICKNAME_PLACEHOLDER = '{name}';

export const BOOK_TEMPLATES: BookTemplate[] = [
  {
    key: 'all-about-me',
    title: 'All About {name}',
    pages: ['My name is {name}.', 'This is my face.', 'I have two eyes.', 'I like to eat.', 'I like to play.', 'I love my family.'],
  },
  {
    key: 'my-family',
    title: "{name}'s Family",
    pages: ['This is Mommy.', 'This is Daddy.', 'This is my home.', 'We eat together.', 'We play together.', 'I love my family.'],
  },
  {
    key: 'at-the-park',
    title: '{name} at the Park',
    pages: ['We go to the park.', 'I see a tree.', 'I go down the slide.', 'I go on the swing.', 'I see a dog.', 'Bye bye, park!'],
  },
  {
    key: 'my-day',
    title: "{name}'s Day",
    pages: ['Good morning, {name}!', 'I eat breakfast.', 'I get dressed.', 'I go outside.', 'I take a bath.', 'Good night, {name}!'],
  },
];

export function bookFromTemplate(
  template: BookTemplate,
  nickname: string,
  newId: () => ID,
  now: string,
  stage: BookStage = 1,
  lang = 'en',
): Book {
  const fill = (s: string) => s.split(NICKNAME_PLACEHOLDER).join(nickname);
  return finalizeBook({
    id: newId(),
    source: 'homemade',
    title: { [lang]: fill(template.title) },
    stage,
    layout: 'text-then-picture',
    pages: template.pages.map((t) => ({ id: newId(), text: { [lang]: fill(t) } })),
    vocabulary: [],
    templateKey: template.key,
    showEndPage: true,
    version: 1,
    containsPrivatePhotos: false,
    updatedAt: now,
  });
}

export function stageColor(stage: BookStage): string {
  return STAGE_RULES[stage].color;
}

/** §9.3 — after a book retires, suggest the next one: same category/stage, highest readiness. */
export function suggestNextBook(
  retired: Pick<Book, 'id' | 'categoryId' | 'stage'>,
  candidates: readonly Book[],
  known: readonly Pick<KnownWord, 'word'>[],
  excludeIds: ReadonlySet<ID>,
): Book | null {
  const pool = candidates.filter(
    (b) => b.id !== retired.id && !excludeIds.has(b.id) && b.stage === retired.stage && b.categoryId === retired.categoryId,
  );
  let best: Book | null = null;
  let bestScore = -1;
  for (const b of pool) {
    const score = readiness(b.vocabulary, known).percent;
    if (score > bestScore) {
      best = b;
      bestScore = score;
    }
  }
  return best;
}
