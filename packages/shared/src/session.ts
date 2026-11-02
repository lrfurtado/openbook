import { COMPLETION_RATIO, MAX_CLIP_HOLD_MS } from './defaults';
import type { Card, CardFact, FactLevel, ID } from './types';
import { loc, type Rng } from './util';

/** In-place Fisher-Yates shuffle on a copy. */
export function fisherYates<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * §9.1 steps 1–2: pick `min(sessionSize, set.length)` cards in shuffled order, making sure the first card
 * is not the card that ended the previous session.
 */
export function buildSessionOrder(
  cardIds: readonly ID[],
  sessionSize: number,
  previousLastCardId?: ID,
  rng: Rng = Math.random,
): ID[] {
  const size = Math.min(sessionSize, cardIds.length);
  const order = fisherYates(cardIds, rng).slice(0, size);
  if (order.length > 1 && previousLastCardId && order[0] === previousLastCardId) {
    const j = 1 + Math.floor(rng() * (order.length - 1));
    [order[0], order[j]] = [order[j], order[0]];
  }
  return order;
}

/** §9.1 step 4: how long a card stays on screen under auto-advance. */
export function cardHoldMs(secondsPerCard: number, clipDurationMs = 0): number {
  return Math.max(secondsPerCard * 1000, Math.min(clipDurationMs, MAX_CLIP_HOLD_MS));
}

export function isCompleted(shown: number, total: number): boolean {
  if (total <= 0) return false;
  return shown / total >= COMPLETION_RATIO - 1e-9;
}

/**
 * FR-17: the fact for a card at the child's magnitude level. Falls back to the nearest lower level when the
 * card has no fact at that level. `rotation` (e.g. a session counter) rotates between facts.
 */
export function pickFact(card: Pick<Card, 'facts'>, level: FactLevel, rotation = 0, lang = 'en'): string | null {
  for (let l = level; l >= 1; l--) {
    const facts = card.facts.filter((f: CardFact) => f.level === l && loc(f.text, lang));
    if (facts.length) return loc(facts[rotation % facts.length].text, lang);
  }
  return null;
}
