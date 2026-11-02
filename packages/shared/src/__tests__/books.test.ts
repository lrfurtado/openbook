import {
  BOOK_TEMPLATES,
  bookFromTemplate,
  extractVocabulary,
  fitText,
  generateBookFromCards,
  minFontSize,
  pageSequence,
  readiness,
  suggestNextBook,
  validateBook,
} from '../books';
import type { Book } from '../types';

let n = 0;
const newId = () => `id${++n}`;

const img = { renditions: [{ size: 1024 as const, url: 'https://x/a.jpg', format: 'jpeg' as const }] };

describe('pageSequence', () => {
  const book = { pages: [{ id: 'a', text: { en: 'one' }, image: img }, { id: 'b', text: { en: 'two' } }], showEndPage: true };

  it('puts text and picture on separate pages (AC-10)', () => {
    expect(pageSequence(book, 'text-then-picture')).toEqual([
      { kind: 'cover' },
      { kind: 'text', pageIndex: 0 },
      { kind: 'picture', pageIndex: 0 },
      { kind: 'text', pageIndex: 1 },
      { kind: 'end' },
    ]);
  });

  it('supports text-only and side-by-side', () => {
    expect(pageSequence(book, 'text-only').map((p) => p.kind)).toEqual(['cover', 'text', 'text', 'end']);
    expect(pageSequence({ ...book, showEndPage: false }, 'side-by-side').map((p) => p.kind)).toEqual(['cover', 'spread', 'text']);
  });
});

describe('vocabulary', () => {
  it('tokenizes, lowercases, strips punctuation and de-duplicates', () => {
    expect(extractVocabulary(['This is Mommy.', "I don't like THIS!", '“Hello,” said Mommy…'])).toEqual([
      "don't", 'hello', 'i', 'is', 'like', 'mommy', 'said', 'this',
    ]);
  });

  it('computes readiness', () => {
    expect(readiness(['a', 'b', 'c', 'd'], [{ word: 'a' }, { word: 'c' }, { word: 'z' }])).toEqual({ percent: 50, known: ['a', 'c'], newWords: ['b', 'd'] });
    expect(readiness([], []).percent).toBe(100);
  });
});

describe('validateBook', () => {
  it('flags word and page limits per stage', () => {
    const pages = Array.from({ length: 13 }, (_, i) => ({ id: `${i}`, text: { en: i === 0 ? 'one two three four five six' : 'hi' } }));
    const issues = validateBook({ stage: 1, pages });
    expect(issues.map((i) => i.code).sort()).toEqual(['too-many-pages', 'too-many-words']);
    expect(validateBook({ stage: 2, pages })).toEqual([]);
  });
});

describe('fitText', () => {
  it('never goes below the stage minimum (AC-11)', () => {
    for (const [w, h] of [[844, 390], [1366, 1024], [640, 360]]) {
      for (const stage of [1, 2, 3, 4] as const) {
        const r = fitText('the bald eagle lives in north america', w, h, stage);
        expect(r.fontSize).toBeGreaterThanOrEqual(Math.ceil(minFontSize(stage, h)) - 0.001);
      }
    }
  });

  it('grows short text and reports overflow', () => {
    const small = fitText('hi', 1000, 600, 4);
    expect(small.fits).toBe(true);
    expect(small.fontSize).toBeGreaterThan(minFontSize(4, 600) * 2);
    const huge = fitText(Array(40).fill('elephant').join(' '), 800, 400, 1);
    expect(huge.fits).toBe(false);
  });
});

describe('generateBookFromCards', () => {
  const cards = Array.from({ length: 10 }, (_, i) => ({
    id: `card${i}`,
    name: { en: i === 0 ? 'Bald Eagle' : `Owl ${i}` },
    facts: [{ level: 1 as const, text: { en: 'it lives in North America' } }],
    image: { ...img, width: 2000, height: 1500 },
  }));

  it('makes 10 text+picture pairs at stage 1', () => {
    const book = generateBookFromCards({ cards, title: 'Birds', newId, now: '' });
    expect(book.pages).toHaveLength(10);
    expect(book.pages[0].text.en).toBe('This is a bald eagle.');
    expect(book.pages[1].text.en).toBe('This is an owl 1.');
    expect(pageSequence(book, 'text-then-picture').filter((p) => p.kind === 'picture')).toHaveLength(10);
    expect(book.vocabulary).toContain('eagle');
  });

  it('adds an L1 fact page at stage ≥2', () => {
    const book = generateBookFromCards({ cards: cards.slice(0, 2), title: 'Birds', stage: 2, newId, now: '' });
    expect(book.pages.map((p) => p.text.en)).toEqual([
      'This is a bald eagle.', 'It lives in North America.', 'This is an owl 1.', 'It lives in North America.',
    ]);
  });
});

describe('templates', () => {
  it('fills the nickname placeholder', () => {
    const book = bookFromTemplate(BOOK_TEMPLATES[0], 'Mia', newId, '');
    expect(book.title.en).toBe('All About Mia');
    expect(book.pages[0].text.en).toBe('My name is Mia.');
    expect(validateBook(book)).toEqual([]);
    for (const t of BOOK_TEMPLATES) expect(validateBook(bookFromTemplate(t, 'Mia', newId, ''))).toEqual([]);
  });

  it('suggests the next book by readiness', () => {
    const mk = (id: string, vocab: string[], stage: 1 | 2 = 1) => ({ id, stage, categoryId: 'c', vocabulary: vocab }) as Book;
    const pick = suggestNextBook(mk('done', []), [mk('a', ['x', 'y']), mk('b', ['x']), mk('c', ['x'], 2)], [{ word: 'x' }], new Set());
    expect(pick?.id).toBe('b');
  });
});
