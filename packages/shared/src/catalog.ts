import type { Attribution, PublishStatus, Rendition } from './types';

/** FR-56: allowed status transitions. */
export const STATUS_TRANSITIONS: Record<PublishStatus, PublishStatus[]> = {
  draft: ['review'],
  review: ['draft', 'published'],
  published: ['archived'],
  archived: ['draft'],
};

export function canTransition(from: PublishStatus, to: PublishStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const MIN_PACK_CARDS = 20;
export const MIN_IMAGE_LONG_EDGE = 1600;
const ALLOWED_LICENSE = /^(public domain|pd|cc0|cc[- ]by(?:[- ]sa)?(?:[- ]\d\.\d)?)(?![- ]n[cd])/i;

export function isAllowedLicense(license: string): boolean {
  return ALLOWED_LICENSE.test(license.trim());
}

export function attributionComplete(a: Partial<Attribution> | undefined | null): a is Attribution {
  return !!a && !!a.author?.trim() && !!a.sourceUrl?.trim() && !!a.license?.trim() && !!a.licenseUrl?.trim();
}

export interface CardForValidation {
  id: string;
  name: Record<string, string>;
  facts: { level: number; text: Record<string, string> }[];
  image: { width: number; height: number };
  attribution?: Partial<Attribution> | null;
}

/** FR-14 / FR-57 validation for official cards. Returns human-readable problems. */
export function validateOfficialCard(card: CardForValidation): string[] {
  const label = card.name.en || card.id;
  const problems: string[] = [];
  if (!card.name.en?.trim()) problems.push(`${card.id}: missing name`);
  if (!attributionComplete(card.attribution)) problems.push(`${label}: incomplete attribution`);
  else if (!isAllowedLicense(card.attribution.license)) problems.push(`${label}: license "${card.attribution.license}" is not PD/CC`);
  if (Math.max(card.image.width, card.image.height) < MIN_IMAGE_LONG_EDGE)
    problems.push(`${label}: image long edge below ${MIN_IMAGE_LONG_EDGE}px`);
  if (!card.facts.some((f) => f.level === 1 && f.text.en?.trim())) problems.push(`${label}: needs at least one L1 fact`);
  return problems;
}

export function validatePack(cards: CardForValidation[]): string[] {
  const problems: string[] = [];
  if (cards.length < MIN_PACK_CARDS) problems.push(`pack has ${cards.length} cards; at least ${MIN_PACK_CARDS} required`);
  for (const c of cards) problems.push(...validateOfficialCard(c));
  return problems;
}

/** NFR-3: choose the rendition that fits a screen's long edge in physical pixels. */
export function pickRendition<R extends Rendition>(renditions: readonly R[], screenLongEdgePx: number): R | undefined {
  const sorted = renditions
    .slice()
    .sort((a, b) => a.size - b.size || (a.format === 'webp' ? -1 : 1));
  return sorted.find((r) => r.size >= screenLongEdgePx) ?? sorted[sorted.length - 1];
}
