import { buildSessionOrder, cardHoldMs, fisherYates, isCompleted, pickFact } from '../session';
import { isAllowedLicense, pickRendition, validatePack, canTransition } from '../catalog';
import { uuidv7, addDays } from '../util';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe('session building', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);

  it('fisherYates is a permutation', () => {
    expect(fisherYates(ids, seeded(1)).sort()).toEqual(ids.slice().sort());
  });

  it('caps session size by set length', () => {
    expect(buildSessionOrder(ids.slice(0, 4), 10)).toHaveLength(4);
    expect(buildSessionOrder(ids, 10)).toHaveLength(10);
  });

  it('never repeats the previous last card first', () => {
    for (let s = 0; s < 500; s++) {
      const rng = seeded(s);
      const prev = ids[s % ids.length];
      expect(buildSessionOrder(ids, 12, prev, rng)[0]).not.toBe(prev);
    }
  });

  it('holds a card for the interval or the clip (max 3 s)', () => {
    expect(cardHoldMs(1)).toBe(1000);
    expect(cardHoldMs(1, 2200)).toBe(2200);
    expect(cardHoldMs(1, 9000)).toBe(3000);
    expect(cardHoldMs(3, 500)).toBe(3000);
  });

  it('completes at 80%', () => {
    expect(isCompleted(8, 10)).toBe(true);
    expect(isCompleted(7, 10)).toBe(false);
    expect(isCompleted(4, 5)).toBe(true);
  });

  it('picks and rotates facts with fallback to lower levels', () => {
    const card = { facts: [{ level: 1 as const, text: { en: 'a' } }, { level: 1 as const, text: { en: 'b' } }, { level: 2 as const, text: { en: 'c' } }] };
    expect(pickFact(card, 1, 0)).toBe('a');
    expect(pickFact(card, 1, 1)).toBe('b');
    expect(pickFact(card, 2, 5)).toBe('c');
    expect(pickFact(card, 3, 0)).toBe('c');
    expect(pickFact({ facts: [] }, 1)).toBeNull();
  });
});

describe('catalog helpers', () => {
  it('picks the smallest rendition covering the screen', () => {
    const r = [3072, 1024, 2048].map((size) => ({ size: size as 1024, url: `u${size}`, format: 'jpeg' as const }));
    expect(pickRendition(r, 900)?.size).toBe(1024);
    expect(pickRendition(r, 1600)?.size).toBe(2048);
    expect(pickRendition(r, 5000)?.size).toBe(3072);
  });

  it('validates packs', () => {
    const good = (i: number) => ({
      id: `c${i}`, name: { en: `C${i}` }, facts: [{ level: 1, text: { en: 'fact' } }], image: { width: 2000, height: 1500 },
      attribution: { author: 'A', sourceUrl: 'https://x', license: 'CC BY-SA 4.0', licenseUrl: 'https://l' },
    });
    expect(validatePack(Array.from({ length: 20 }, (_, i) => good(i)))).toEqual([]);
    const bad = [...Array.from({ length: 18 }, (_, i) => good(i)), { ...good(99), attribution: { author: 'x', sourceUrl: '', license: 'CC BY', licenseUrl: '' } }, { ...good(98), image: { width: 800, height: 600 }, facts: [] }];
    const problems = validatePack(bad);
    expect(problems.some((p) => p.includes('attribution'))).toBe(true);
    expect(problems.some((p) => p.includes('1600'))).toBe(true);
    expect(problems.some((p) => p.includes('L1'))).toBe(true);
    expect(validatePack(bad.slice(0, 5))[0]).toMatch(/at least 20/);
  });

  it('enforces the publish workflow', () => {
    expect(canTransition('draft', 'review')).toBe(true);
    expect(canTransition('draft', 'published')).toBe(false);
    expect(canTransition('review', 'published')).toBe(true);
  });
});

describe('util', () => {
  it('generates v7 uuids', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7(1000) < uuidv7(2000)).toBe(true);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('isAllowedLicense (FR-12)', () => {
  it.each(['Public domain', 'CC0', 'CC BY 2.0', 'CC BY-SA 4.0', 'CC BY-SA 2.0 de'])('allows %s', (license) => {
    expect(isAllowedLicense(license)).toBe(true);
  });

  it.each(['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'All rights reserved'])('rejects %s', (license) => {
    expect(isAllowedLicense(license)).toBe(false);
  });
});
