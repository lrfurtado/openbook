import { DEFAULT_CHILD_SETTINGS } from '../defaults';
import { computeStreaks, createNextSet, rolloverBooks, rolloverSets, setTodayStatus } from '../scheduler';
import type { ActiveBook, ActiveSet, CardProgress, SessionLog } from '../types';
import { addDays } from '../util';

const settings = { ...DEFAULT_CHILD_SETTINGS, sessionSize: 10, daysPerSet: 5 };
const packCards = Array.from({ length: 25 }, (_, i) => `c${i}`);
let n = 0;
const newId = () => `id${++n}`;

function at(day: string, hour: number) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
}

function flashLog(setId: string, day: string, hour: number, completed = true): SessionLog {
  return { id: newId(), childId: 'k', type: 'flash', setId, startedAt: at(day, hour), endedAt: at(day, hour), completed };
}

function firstSet(today: string): ActiveSet {
  return createNextSet({
    id: 'set1', childId: 'k', sourceType: 'pack', sourceId: 'p', sourceCardIds: packCards,
    childSets: [], size: 10, today, now: at(today, 8),
  })!;
}

function run(sets: ActiveSet[], logs: SessionLog[], progress: CardProgress[], today: string) {
  return rolloverSets({
    childId: 'k', settings, sets, logs, progress, today, now: at(today, 12),
    sourceCards: () => packCards, newId,
  });
}

function apply(sets: ActiveSet[], res: ReturnType<typeof run>) {
  const map = new Map(sets.map((s) => [s.id, s]));
  for (const s of res.upsertSets) map.set(s.id, s);
  return [...map.values()];
}

describe('rolloverSets', () => {
  const day1 = '2026-03-02';

  it('retires a set after N active days and activates the next (6-day timeline)', () => {
    let sets = [firstSet(day1)];
    const logs: SessionLog[] = [];
    let progress: CardProgress[] = [];
    for (let d = 0; d < 5; d++) {
      const day = addDays(day1, d);
      sets = apply(sets, run(sets, logs, progress, day));
      expect(sets.filter((s) => s.status === 'active')).toHaveLength(1);
      logs.push(flashLog('set1', day, 9), flashLog('set1', day, 13));
    }
    // Day 6 foreground: 5 past active days → retire.
    const res = run(sets, logs, progress, addDays(day1, 5));
    sets = apply(sets, res);
    progress = res.upsertProgress;
    expect(res.retiredSetIds).toEqual(['set1']);
    const retired = sets.find((s) => s.id === 'set1')!;
    expect(retired.status).toBe('retired');
    expect(retired.activeDays).toHaveLength(5);
    const next = sets.find((s) => s.status === 'active')!;
    expect(next.cardIds).toEqual(packCards.slice(10, 20));
    expect(progress).toHaveLength(10);
    expect(progress.every((p) => p.cycles === 1 && p.factLevel === 2)).toBe(true);
  });

  it('does not count missed days', () => {
    const sets = [firstSet(day1)];
    const logs = [0, 2, 4, 6].map((d) => flashLog('set1', addDays(day1, d), 9));
    const res = run(sets, logs, [], addDays(day1, 20));
    expect(res.retiredSetIds).toHaveLength(0);
    expect(res.upsertSets[0].activeDays).toHaveLength(4);
  });

  it('ignores incomplete sessions', () => {
    const sets = [firstSet(day1)];
    const logs = [0, 1, 2, 3, 4].map((d) => flashLog('set1', addDays(day1, d), 9, false));
    expect(run(sets, logs, [], addDays(day1, 6)).retiredSetIds).toHaveLength(0);
  });

  it('retires on the N-th day once all sessions are done', () => {
    const sets = [firstSet(day1)];
    const logs: SessionLog[] = [];
    for (let d = 0; d < 4; d++) logs.push(flashLog('set1', addDays(day1, d), 9));
    const day5 = addDays(day1, 4);
    logs.push(flashLog('set1', day5, 9));
    expect(run(sets, logs, [], day5).retiredSetIds).toHaveLength(0);
    logs.push(flashLog('set1', day5, 13), flashLog('set1', day5, 17));
    expect(run(sets, logs, [], day5).retiredSetIds).toEqual(['set1']);
  });

  it('honours extraDays', () => {
    const sets = [{ ...firstSet(day1), extraDays: 2 }];
    const logs = [0, 1, 2, 3, 4].map((d) => flashLog('set1', addDays(day1, d), 9));
    expect(run(sets, logs, [], addDays(day1, 5)).retiredSetIds).toHaveLength(0);
  });

  it('flags an exhausted source', () => {
    const used: ActiveSet[] = [
      { ...firstSet(day1), id: 'old1', status: 'retired', cardIds: packCards.slice(0, 10) },
      { ...firstSet(day1), id: 'old2', status: 'retired', cardIds: packCards.slice(10, 20) },
    ];
    const cur: ActiveSet = { ...firstSet(day1), id: 'set1', cardIds: packCards.slice(20) };
    const logs = [0, 1, 2, 3, 4].map((d) => flashLog('set1', addDays(day1, d), 9));
    const res = run([...used, cur], logs, [], addDays(day1, 5));
    expect(res.retiredSetIds).toEqual(['set1']);
    expect(res.sourceExhausted).toBe(true);
    expect(res.upsertSets.filter((s) => s.status === 'active')).toHaveLength(0);
  });

  it('caps factLevel at 3', () => {
    const sets = [firstSet(day1)];
    const logs = [0, 1, 2, 3, 4].map((d) => flashLog('set1', addDays(day1, d), 9));
    const progress = packCards.slice(0, 10).map((cardId) => ({ childId: 'k', cardId, cycles: 4, factLevel: 3 as const }));
    const res = run(sets, logs, progress, addDays(day1, 5));
    expect(res.upsertProgress.every((p) => p.factLevel === 3 && p.cycles === 5)).toBe(true);
  });
});

describe('createNextSet', () => {
  it('restarts an exhausted source when re-activating', () => {
    const all: ActiveSet[] = [{ ...firstSet('2026-01-01'), status: 'retired', cardIds: packCards }];
    const base = { id: 'x', childId: 'k', sourceType: 'pack' as const, sourceId: 'p', sourceCardIds: packCards, childSets: all, size: 10, today: '2026-02-01', now: '' };
    expect(createNextSet(base)).toBeNull();
    expect(createNextSet({ ...base, restartWhenExhausted: true })!.cardIds).toEqual(packCards.slice(0, 10));
  });
});

describe('setTodayStatus', () => {
  it('counts done and remaining sessions', () => {
    const set = firstSet('2026-03-02');
    const logs = [flashLog('set1', '2026-03-02', 9), flashLog('set1', '2026-03-02', 10, false), flashLog('set1', '2026-03-01', 9)];
    expect(setTodayStatus(set, logs, settings, '2026-03-02')).toEqual({ done: 1, remaining: 2, activeDayCount: 2, targetDays: 5 });
  });
});

describe('rolloverBooks', () => {
  it('retires an active book after daysPerBook active days of 2 readings', () => {
    const ab: ActiveBook = { id: 'ab', childId: 'k', bookId: 'b', startedOn: '2026-03-02', activeDays: [], extraDays: 0, status: 'active', updatedAt: '' };
    const logs: SessionLog[] = [];
    let book = ab;
    for (let d = 0; d < 5; d++) {
      const day = addDays('2026-03-02', d);
      for (const h of [9, 17]) {
        logs.push({ id: newId(), childId: 'k', type: 'reading', activeBookId: 'ab', bookId: 'b', startedAt: at(day, h), endedAt: at(day, h), completed: true, pagesShown: 10 });
        const res = rolloverBooks([book], logs, settings, day, '');
        book = res.upsertBooks[0] ?? book;
      }
      expect(book.status).toBe(d < 4 ? 'active' : 'retired');
    }
  });
});

describe('computeStreaks', () => {
  it('computes current and longest streaks', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06'];
    const logs = days.map((d) => flashLog('s', d, 9));
    logs.push(flashLog('s', '2026-03-04', 9, false));
    expect(computeStreaks(logs, '2026-03-07')).toMatchObject({ current: 2, longest: 3 });
    expect(computeStreaks(logs, '2026-03-08').current).toBe(0);
  });
});
