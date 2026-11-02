import type {
  ActiveBook,
  ActiveSet,
  CardProgress,
  ChildSettings,
  FactLevel,
  ID,
  ISODate,
  SessionLog,
  SourceType,
} from './types';
import { addDays, localDate } from './util';

/** Local date a log belongs to (the day it started). */
export function logDate(log: Pick<SessionLog, 'startedAt'>): ISODate {
  return localDate(new Date(log.startedAt));
}

export function completedOn(logs: readonly SessionLog[], match: (l: SessionLog) => boolean, day: ISODate): number {
  return logs.filter((l) => l.completed && match(l) && logDate(l) === day).length;
}

function activeDaysFor(existing: readonly ISODate[], logs: readonly SessionLog[], match: (l: SessionLog) => boolean) {
  const days = new Set(existing);
  for (const l of logs) if (l.completed && match(l)) days.add(logDate(l));
  return [...days].sort();
}

/**
 * FR-38: retire after N *active* days. The N-th active day still gets all of its scheduled sessions: we
 * retire once N active days lie in the past, or once today is the N-th day and its sessions are all done.
 */
function shouldRetire(activeDays: readonly ISODate[], target: number, today: ISODate, doneToday: number, perDay: number) {
  const before = activeDays.filter((d) => d < today).length;
  return before >= target || (activeDays.length >= target && doneToday >= perDay);
}

export interface TodayStatus {
  done: number;
  remaining: number;
  activeDayCount: number;
  targetDays: number;
}

export function setTodayStatus(set: ActiveSet, logs: readonly SessionLog[], settings: ChildSettings, today: ISODate): TodayStatus {
  const match = (l: SessionLog) => l.type === 'flash' && l.setId === set.id;
  const done = completedOn(logs, match, today);
  return {
    done,
    remaining: Math.max(0, settings.sessionsPerDay - done),
    activeDayCount: activeDaysFor(set.activeDays, logs, match).length,
    targetDays: settings.daysPerSet + set.extraDays,
  };
}

export function bookTodayStatus(book: ActiveBook, logs: readonly SessionLog[], settings: ChildSettings, today: ISODate): TodayStatus {
  const match = (l: SessionLog) => l.type === 'reading' && l.activeBookId === book.id;
  const done = completedOn(logs, match, today);
  return {
    done,
    remaining: Math.max(0, settings.readingsPerDay - done),
    activeDayCount: activeDaysFor(book.activeDays, logs, match).length,
    targetDays: settings.daysPerBook + book.extraDays,
  };
}

/** Cards of a source not yet used in any of the child's sets for that source. */
export function unseenCards(sourceCardIds: readonly ID[], childSets: readonly ActiveSet[], sourceType: SourceType, sourceId: ID): ID[] {
  const seen = new Set<ID>();
  for (const s of childSets) if (s.sourceType === sourceType && s.sourceId === sourceId) s.cardIds.forEach((c) => seen.add(c));
  return sourceCardIds.filter((c) => !seen.has(c));
}

export interface NewSetParams {
  id: ID;
  childId: ID;
  sourceType: SourceType;
  sourceId: ID;
  sourceCardIds: readonly ID[];
  childSets: readonly ActiveSet[];
  size: number;
  today: ISODate;
  now: string;
  /** Start over from the beginning of the source when every card has been seen (re-activation, FR-37). */
  restartWhenExhausted?: boolean;
}

/** Builds the next set from a source, or returns null when the source has no cards left. */
export function createNextSet(p: NewSetParams): ActiveSet | null {
  let cards = unseenCards(p.sourceCardIds, p.childSets, p.sourceType, p.sourceId);
  if (cards.length === 0 && p.restartWhenExhausted) cards = p.sourceCardIds.slice();
  if (cards.length === 0) return null;
  return {
    id: p.id,
    childId: p.childId,
    sourceType: p.sourceType,
    sourceId: p.sourceId,
    cardIds: cards.slice(0, p.size),
    startedOn: p.today,
    activeDays: [],
    extraDays: 0,
    status: 'active',
    updatedAt: p.now,
  };
}

export function retireProgress(
  cardIds: readonly ID[],
  childId: ID,
  progress: ReadonlyMap<ID, CardProgress>,
): CardProgress[] {
  return cardIds.map((cardId) => {
    const prev = progress.get(cardId);
    const cycles = (prev?.cycles ?? 0) + 1;
    return { childId, cardId, lastShownAt: prev?.lastShownAt, cycles, factLevel: Math.min(3, cycles + 1) as FactLevel };
  });
}

export interface RolloverInput {
  childId: ID;
  settings: ChildSettings;
  sets: readonly ActiveSet[]; // all of the child's sets, active and retired
  logs: readonly SessionLog[];
  progress: readonly CardProgress[];
  today: ISODate;
  now: string;
  sourceCards: (sourceType: SourceType, sourceId: ID) => readonly ID[] | undefined;
  newId: () => ID;
}

export interface RolloverResult {
  /** Sets that changed or were created. */
  upsertSets: ActiveSet[];
  upsertProgress: CardProgress[];
  retiredSetIds: ID[];
  /** A set retired and its source had nothing left (FR-34). */
  sourceExhausted: boolean;
}

/** §9.2 — day rollover & whole-set retirement. Pure; callers persist the result. */
export function rolloverSets(input: RolloverInput): RolloverResult {
  const { settings, today, now } = input;
  const all = input.sets.slice();
  const progress = new Map(input.progress.map((p) => [p.cardId, p]));
  const upsert = new Map<ID, ActiveSet>();
  const retiredSetIds: ID[] = [];
  let sourceExhausted = false;

  for (const set of input.sets) {
    if (set.status !== 'active') continue;
    const match = (l: SessionLog) => l.type === 'flash' && l.setId === set.id;
    const activeDays = activeDaysFor(set.activeDays, input.logs, match);
    const doneToday = completedOn(input.logs, match, today);
    let next: ActiveSet = set;
    if (activeDays.join() !== set.activeDays.join()) next = { ...set, activeDays, updatedAt: now };

    if (shouldRetire(activeDays, settings.daysPerSet + set.extraDays, today, doneToday, settings.sessionsPerDay)) {
      next = { ...next, status: 'retired', retiredOn: today, updatedAt: now };
      retiredSetIds.push(set.id);
      for (const p of retireProgress(set.cardIds, input.childId, progress)) progress.set(p.cardId, p);
      const idx = all.findIndex((s) => s.id === set.id);
      all[idx] = next;

      const sourceCardIds = input.sourceCards(set.sourceType, set.sourceId);
      const created = sourceCardIds
        ? createNextSet({
            id: input.newId(),
            childId: input.childId,
            sourceType: set.sourceType,
            sourceId: set.sourceId,
            sourceCardIds,
            childSets: all,
            size: settings.sessionSize,
            today,
            now,
          })
        : null;
      if (created) {
        all.push(created);
        upsert.set(created.id, created);
      } else {
        sourceExhausted = true;
      }
    }
    if (next !== set) upsert.set(set.id, next);
  }

  const touched = new Set(retiredSetIds.flatMap((id) => input.sets.find((s) => s.id === id)!.cardIds));
  return {
    upsertSets: [...upsert.values()],
    upsertProgress: [...touched].map((id) => progress.get(id)!),
    retiredSetIds,
    sourceExhausted,
  };
}

export interface BookRolloverResult {
  upsertBooks: ActiveBook[];
  retiredActiveBookIds: ID[];
}

/** §9.3 day rollover for active books. */
export function rolloverBooks(
  books: readonly ActiveBook[],
  logs: readonly SessionLog[],
  settings: ChildSettings,
  today: ISODate,
  now: string,
): BookRolloverResult {
  const upsertBooks: ActiveBook[] = [];
  const retiredActiveBookIds: ID[] = [];
  for (const b of books) {
    if (b.status !== 'active') continue;
    const match = (l: SessionLog) => l.type === 'reading' && l.activeBookId === b.id;
    const activeDays = activeDaysFor(b.activeDays, logs, match);
    const doneToday = completedOn(logs, match, today);
    let next: ActiveBook = b;
    if (activeDays.join() !== b.activeDays.join()) next = { ...b, activeDays, updatedAt: now };
    if (shouldRetire(activeDays, settings.daysPerBook + b.extraDays, today, doneToday, settings.readingsPerDay)) {
      next = { ...next, status: 'retired', retiredOn: today, updatedAt: now };
      retiredActiveBookIds.push(b.id);
    }
    if (next !== b) upsertBooks.push(next);
  }
  return { upsertBooks, retiredActiveBookIds };
}

export interface Streaks {
  current: number;
  longest: number;
  completedDays: ISODate[];
}

/** FR-42: consecutive days with ≥1 completed session or reading. */
export function computeStreaks(logs: readonly SessionLog[], today: ISODate): Streaks {
  const days = [...new Set(logs.filter((l) => l.completed).map(logDate))].sort();
  let longest = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const set = new Set(days);
  let current = 0;
  // A streak is still alive if the last completed day was today or yesterday.
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, completedDays: days };
}
