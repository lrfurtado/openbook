import {
  createNextSet,
  DEFAULT_CHILD_SETTINGS,
  finalizeBook,
  localDate,
  pickRendition,
  rolloverBooks,
  rolloverSets,
  type ActiveBook,
  type ActiveSet,
  type Book,
  type BookManifest,
  type Card,
  type CardProgress,
  type ChildProfile,
  type CustomDeck,
  type ID,
  type KnownWord,
  type Localized,
  type PackManifest,
  type Rendition,
  type SessionLog,
  type SourceType,
} from '@openbook/shared';
import { Dimensions, PixelRatio } from 'react-native';
import { deleteDoc, getDoc, getDocs, listDocs, putDoc, putDocs } from './db';
import { newId, nowIso } from './ids';
import { media } from './media';

// ---- Local-only records ----

/** A pack downloaded to this device (FR-3/4/5). */
export interface LocalPack {
  id: ID;
  version: number;
  title: Localized;
  description: Localized;
  categorySlug: string;
  subcategory: string;
  cardIds: ID[];
  coverCardId: ID;
  bytes: number;
  status: 'partial' | 'complete';
  attributionSummary: string;
  downloadedAt: string;
  updatedAt: string;
}

export const cardMediaKey = (cardId: ID) => `cards/${cardId}.jpg`;
export const userMediaKey = (id: ID) => `user/${id}.jpg`;

/** NFR-3: the rendition that fits this device's screen. */
export function deviceRendition(renditions: readonly Rendition[]): Rendition | undefined {
  const { width, height } = Dimensions.get('screen');
  return pickRendition(renditions, Math.max(width, height) * PixelRatio.get());
}

// ---- Children ----

export const listChildren = () => listDocs<ChildProfile>('child');
export const getChild = (id: ID) => getDoc<ChildProfile>('child', id);
export const saveChild = (child: ChildProfile) => putDoc('child', { ...child, updatedAt: nowIso() });

export async function createChild(nickname: string, avatar: string, birthMonth?: string): Promise<ChildProfile> {
  const child: ChildProfile = {
    id: newId(),
    nickname: nickname.trim(),
    avatar,
    birthMonth,
    settings: { ...DEFAULT_CHILD_SETTINGS },
    updatedAt: nowIso(),
  };
  return putDoc('child', child);
}

export const deleteChild = (id: ID) => deleteDoc('child', id);

// ---- Packs & cards ----

export const listPacks = () => listDocs<LocalPack>('pack');
export const getPack = (id: ID) => getDoc<LocalPack>('pack', id);
export const getCards = (ids: readonly ID[]) => getDocs<Card>('card', ids);
export const getCard = (id: ID) => getDoc<Card>('card', id);
export const listUserCards = () => listDocs<Card>('card', { parentId: 'user' });

export type ProgressFn = (done: number, total: number) => void;

/**
 * Downloads (or updates) a pack: card records plus one image per card. Images already on the device are
 * skipped, so re-running after an interruption resumes where it stopped (FR-3). Progress is kept because
 * it is keyed by card id (FR-4).
 */
export async function downloadPack(manifest: PackManifest, onProgress: ProgressFn): Promise<LocalPack> {
  const { pack } = manifest;
  const previous = await getPack(pack.id);
  const record: LocalPack = {
    id: pack.id,
    version: previous?.status === 'complete' ? previous.version : 0,
    title: pack.title,
    description: pack.description,
    categorySlug: pack.categorySlug,
    subcategory: pack.subcategory,
    cardIds: manifest.cardIds,
    coverCardId: manifest.cardIds[0],
    bytes: previous?.bytes ?? 0,
    status: 'partial',
    attributionSummary: pack.attributionSummary,
    downloadedAt: previous?.downloadedAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  await putDoc('pack', record);

  const oldCards = new Map((await getCards(previous?.cardIds ?? [])).map((c) => [c.id, c]));
  let done = 0;
  let bytes = 0;
  onProgress(0, manifest.cards.length);
  for (const mc of manifest.cards) {
    const key = cardMediaKey(mc.id);
    const changed = oldCards.get(mc.id)?.updatedAt !== mc.updatedAt;
    if (changed || !(await media.has(key))) {
      const rendition = deviceRendition(mc.image.renditions);
      if (!rendition) throw new Error(`No image for ${mc.name.en}`);
      bytes += await media.download(rendition.url, key);
    } else {
      bytes += await media.size(key);
    }
    await putDoc('card', { ...mc, image: { ...mc.image, localPath: key } } satisfies Card);
    onProgress(++done, manifest.cards.length);
  }

  // Cards dropped by an update: remove their files unless something else still uses them.
  const removed = [...oldCards.keys()].filter((id) => !manifest.cardIds.includes(id));
  await removeUnusedCards(removed, pack.id);

  return putDoc('pack', { ...record, version: pack.version, bytes, status: 'complete', updatedAt: nowIso() });
}

/** Card ids still referenced by any other downloaded pack, custom deck or book. */
async function referencedCardIds(exceptPackId?: ID): Promise<Set<ID>> {
  const used = new Set<ID>();
  for (const p of await listPacks()) if (p.id !== exceptPackId) p.cardIds.forEach((id) => used.add(id));
  for (const d of await listDecks()) d.cardIds.forEach((id) => used.add(id));
  for (const b of await listBooks()) b.pages.forEach((pg) => pg.cardId && used.add(pg.cardId));
  return used;
}

async function removeUnusedCards(cardIds: readonly ID[], exceptPackId?: ID) {
  if (!cardIds.length) return;
  const used = await referencedCardIds(exceptPackId);
  for (const id of cardIds) {
    if (used.has(id)) continue;
    await media.remove(cardMediaKey(id));
    await deleteDoc('card', id);
  }
}

/** FR-5: removes a pack and its images. Progress and session history stay. */
export async function removePack(packId: ID): Promise<void> {
  const pack = await getPack(packId);
  if (!pack) return;
  await deleteDoc('pack', packId);
  await removeUnusedCards(pack.cardIds, packId);
}

/** FR-8/9: a user card from an already resized local image. */
export async function saveUserCard(
  input: { id?: ID; name: string; facts: string[]; imageUri?: string; width?: number; height?: number },
): Promise<Card> {
  const id = input.id ?? newId();
  const existing = input.id ? await getCard(input.id) : null;
  let image = existing?.image ?? { renditions: [], width: 0, height: 0 };
  if (input.imageUri) {
    await media.saveFromUri(input.imageUri, userMediaKey(id));
    image = { renditions: [], localPath: userMediaKey(id), width: input.width ?? 0, height: input.height ?? 0 };
  }
  const card: Card = {
    id,
    source: 'user',
    name: { en: input.name.trim() },
    facts: input.facts
      .map((t, i) => ({ level: (i + 1) as 1 | 2 | 3, text: { en: t.trim() } }))
      .filter((f) => f.text.en),
    image,
    updatedAt: nowIso(),
  };
  return putDoc('card', card, { parentId: 'user' });
}

export async function deleteUserCard(id: ID) {
  await media.remove(userMediaKey(id));
  await deleteDoc('card', id);
}

// ---- Custom decks (FR-10) ----

export const listDecks = () => listDocs<CustomDeck>('deck');
export const getDeck = (id: ID) => getDoc<CustomDeck>('deck', id);
export const saveDeck = (deck: CustomDeck) => putDoc('deck', { ...deck, updatedAt: nowIso() });
export const deleteDeck = (id: ID) => deleteDoc('deck', id);

export async function createDeck(title: string): Promise<CustomDeck> {
  return putDoc('deck', { id: newId(), title, cardIds: [], updatedAt: nowIso() });
}

export async function sourceCardIds(sourceType: SourceType, sourceId: ID): Promise<ID[] | undefined> {
  if (sourceType === 'pack') {
    const p = await getPack(sourceId);
    return p?.status === 'complete' ? p.cardIds : undefined;
  }
  return (await getDeck(sourceId))?.cardIds;
}

export async function sourceTitle(sourceType: SourceType, sourceId: ID): Promise<string> {
  if (sourceType === 'pack') return (await getPack(sourceId))?.title.en ?? '';
  return (await getDeck(sourceId))?.title ?? '';
}

// ---- Program: sets, progress, logs (§4.7) ----

export const listSets = (childId: ID) => listDocs<ActiveSet>('set', { childId });
export const getSet = (id: ID) => getDoc<ActiveSet>('set', id);
export const saveSet = (set: ActiveSet) => putDoc('set', { ...set, updatedAt: nowIso() }, { childId: set.childId });
export const listProgress = (childId: ID) => listDocs<CardProgress & { id: string }>('progress', { childId });
export const listLogs = (childId: ID) => listDocs<SessionLog>('log', { childId });

const progressId = (p: Pick<CardProgress, 'childId' | 'cardId'>) => `${p.childId}:${p.cardId}`;

export async function saveProgress(rows: readonly CardProgress[]) {
  await putDocs('progress', rows.map((p) => ({ ...p, id: progressId(p) })), (p) => ({ childId: p.childId }));
}

export type AddSetResult = { ok: true; set: ActiveSet } | { ok: false; reason: 'max-active' | 'exhausted' | 'missing' };

/** Starts a new set from a pack or deck. `restart` re-activates a fully seen source (FR-37). */
export async function addSet(child: ChildProfile, sourceType: SourceType, sourceId: ID, restart = false): Promise<AddSetResult> {
  const sets = await listSets(child.id);
  if (sets.filter((s) => s.status === 'active').length >= child.settings.maxActiveSets) return { ok: false, reason: 'max-active' };
  const cards = await sourceCardIds(sourceType, sourceId);
  if (!cards?.length) return { ok: false, reason: 'missing' };
  const set = createNextSet({
    id: newId(),
    childId: child.id,
    sourceType,
    sourceId,
    sourceCardIds: cards,
    childSets: sets,
    size: child.settings.sessionSize,
    today: localDate(),
    now: nowIso(),
    restartWhenExhausted: restart,
  });
  if (!set) return { ok: false, reason: 'exhausted' };
  await putDoc('set', set, { childId: child.id });
  if (child.chooseNewSource) await saveChild({ ...child, chooseNewSource: false });
  return { ok: true, set };
}

/** FR-38: retire early. */
export async function retireSet(child: ChildProfile, setId: ID) {
  const set = await getSet(setId);
  if (!set || set.status !== 'active') return;
  const progress = new Map((await listProgress(child.id)).map((p) => [p.cardId, p]));
  const rows = set.cardIds.map((cardId) => {
    const cycles = (progress.get(cardId)?.cycles ?? 0) + 1;
    return { childId: child.id, cardId, cycles, factLevel: Math.min(3, cycles + 1) as 1 | 2 | 3, lastShownAt: progress.get(cardId)?.lastShownAt };
  });
  await saveProgress(rows);
  await saveSet({ ...set, status: 'retired', retiredOn: localDate() });
}

export async function extendSet(setId: ID, days = 1) {
  const set = await getSet(setId);
  if (set) await saveSet({ ...set, extraDays: set.extraDays + days });
}

export async function addLog(log: SessionLog) {
  await putDoc('log', log, { childId: log.childId });
}

/** §9.2 / §9.3 day rollover for one child. */
export async function rolloverChild(child: ChildProfile, today = localDate()) {
  const now = nowIso();
  const [sets, logs, progress, activeBooks] = await Promise.all([
    listSets(child.id),
    listLogs(child.id),
    listProgress(child.id),
    listActiveBooks(child.id),
  ]);
  const sources = new Map<string, readonly ID[] | undefined>();
  for (const s of sets) {
    const key = `${s.sourceType}:${s.sourceId}`;
    if (!sources.has(key)) sources.set(key, await sourceCardIds(s.sourceType, s.sourceId));
  }
  const res = rolloverSets({
    childId: child.id,
    settings: child.settings,
    sets,
    logs,
    progress,
    today,
    now,
    sourceCards: (t, id) => sources.get(`${t}:${id}`),
    newId,
  });
  await putDocs('set', res.upsertSets, (s) => ({ childId: s.childId }));
  await saveProgress(res.upsertProgress);
  if (res.sourceExhausted && !child.chooseNewSource) await saveChild({ ...child, chooseNewSource: true });

  const books = rolloverBooks(activeBooks, logs, child.settings, today, now);
  await putDocs('activeBook', books.upsertBooks, (b) => ({ childId: b.childId }));
  return { retiredSets: res.retiredSetIds.length, retiredBooks: books.retiredActiveBookIds.length };
}

export async function rolloverAll() {
  for (const child of await listChildren()) await rolloverChild(child);
}

// ---- Books (§4.12) ----

export const listBooks = () => listDocs<Book>('book');
export const getBook = (id: ID) => getDoc<Book>('book', id);

/** Recomputes vocabulary on every save (§9.3, AC-12). */
export async function saveBook(book: Book): Promise<Book> {
  const containsPrivatePhotos = book.source !== 'official' && book.pages.some((p) => p.image?.localPath?.startsWith('user/'));
  return putDoc('book', finalizeBook({ ...book, containsPrivatePhotos, updatedAt: nowIso() }));
}

/** The picture shown for a book on shelves and lists: its cover, else the first illustrated page. */
export const bookCover = (book: Pick<Book, 'coverImage' | 'pages'>) => book.coverImage ?? book.pages.find((p) => p.image)?.image;

/** An editable homemade copy of any book (e.g. an official one); images are shared, not duplicated. */
export async function copyBook(book: Book, title: string): Promise<Book> {
  return saveBook({
    ...book,
    id: newId(),
    source: 'homemade',
    title: { en: title },
    pages: book.pages.map((p) => ({ ...p, id: newId(), voiceRecordingId: undefined })),
    status: undefined,
    version: 1,
    templateKey: undefined,
  });
}

export async function deleteBook(id: ID) {
  const book = await getBook(id);
  for (const p of book?.pages ?? []) if (p.image?.localPath?.startsWith('user/')) await media.remove(p.image.localPath);
  await deleteDoc('book', id);
}

/** Downloads an official book and its page images for offline reading (FR-60). */
export async function downloadBook(manifest: BookManifest, onProgress: ProgressFn): Promise<Book> {
  const book = manifest.data;
  const pages = [];
  let done = 0;
  const withImages = book.pages.filter((p) => p.image).length;
  onProgress(0, withImages);
  for (const page of book.pages) {
    if (!page.image) {
      pages.push(page);
      continue;
    }
    const key = page.cardId ? cardMediaKey(page.cardId) : `books/${book.id}/${page.id}.jpg`;
    if (!(await media.has(key))) {
      const r = deviceRendition(page.image.renditions);
      if (r) await media.download(r.url, key);
    }
    pages.push({ ...page, image: { ...page.image, localPath: key } });
    onProgress(++done, withImages);
  }
  return putDoc('book', { ...book, pages, updatedAt: nowIso() });
}

export const listActiveBooks = (childId: ID) => listDocs<ActiveBook>('activeBook', { childId });
export const getActiveBook = (id: ID) => getDoc<ActiveBook>('activeBook', id);
const saveActiveBook = (b: ActiveBook) => putDoc('activeBook', { ...b, updatedAt: nowIso() }, { childId: b.childId });

export async function addActiveBook(child: ChildProfile, bookId: ID): Promise<'ok' | 'max-active' | 'already'> {
  const books = await listActiveBooks(child.id);
  const active = books.filter((b) => b.status === 'active');
  if (active.some((b) => b.bookId === bookId)) return 'already';
  if (active.length >= child.settings.maxActiveBooks) return 'max-active';
  await saveActiveBook({
    id: newId(),
    childId: child.id,
    bookId,
    startedOn: localDate(),
    activeDays: [],
    extraDays: 0,
    status: 'active',
    updatedAt: nowIso(),
  });
  return 'ok';
}

export async function retireActiveBook(id: ID) {
  const b = await getActiveBook(id);
  if (b && b.status === 'active') await saveActiveBook({ ...b, status: 'retired', retiredOn: localDate() });
}

export async function extendActiveBook(id: ID, days = 1) {
  const b = await getActiveBook(id);
  if (b) await saveActiveBook({ ...b, extraDays: b.extraDays + days });
}

// ---- Known words (FR-74) ----

type KnownWordDoc = KnownWord & { id: string };

export const listKnownWords = (childId: ID) => listDocs<KnownWordDoc>('knownWord', { childId });

export async function addKnownWords(childId: ID, words: readonly string[], source: KnownWord['source'], bookId?: ID) {
  const existing = new Set((await listKnownWords(childId)).map((w) => w.word));
  const rows = words
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w && !existing.has(w))
    .map((word) => ({ id: `${childId}:${word}`, childId, word, source, bookId, addedAt: nowIso(), updatedAt: nowIso() }));
  await putDocs('knownWord', rows, (r) => ({ childId: r.childId }));
}

export const removeKnownWord = (childId: ID, word: string) => deleteDoc('knownWord', `${childId}:${word}`);
