import * as SQLite from 'expo-sqlite';

/**
 * Local store (§2.1). Every entity is a JSON document keyed by (type, id), with `childId`/`parentId`
 * columns for the common lookups and `updatedAt`/`deletedAt` so records are ready for sync (§9.4).
 */
export type DocType =
  | 'child'
  | 'pack'
  | 'card'
  | 'deck'
  | 'set'
  | 'progress'
  | 'log'
  | 'book'
  | 'activeBook'
  | 'knownWord';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS docs (
     type TEXT NOT NULL,
     id TEXT NOT NULL,
     childId TEXT,
     parentId TEXT,
     data TEXT NOT NULL,
     updatedAt TEXT NOT NULL,
     deletedAt TEXT,
     PRIMARY KEY (type, id)
   );
   CREATE INDEX IF NOT EXISTS docs_child ON docs (type, childId);
   CREATE INDEX IF NOT EXISTS docs_parent ON docs (type, parentId);`,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('openbook.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      let version = row?.user_version ?? 0;
      while (version < MIGRATIONS.length) {
        await db.execAsync(MIGRATIONS[version]);
        version++;
        await db.execAsync(`PRAGMA user_version = ${version}`);
      }
      return db;
    })();
  }
  return dbPromise;
}

// ---- change notifications: screens re-query when the tables they read change ----

type Listener = (types: ReadonlySet<DocType>) => void;
const listeners = new Set<Listener>();
let pending = new Set<DocType>();
let scheduled = false;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(type: DocType) {
  pending.add(type);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    const types = pending;
    pending = new Set();
    scheduled = false;
    listeners.forEach((l) => l(types));
  });
}

// ---- document API ----

interface Row {
  data: string;
}

export interface Index {
  childId?: string | null;
  parentId?: string | null;
}

export async function getDoc<T>(type: DocType, id: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT data FROM docs WHERE type = ? AND id = ? AND deletedAt IS NULL', type, id);
  return row ? (JSON.parse(row.data) as T) : null;
}

export async function getDocs<T>(type: DocType, ids: readonly string[]): Promise<T[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const out = new Map<string, T>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db.getAllAsync<Row & { id: string }>(
      `SELECT id, data FROM docs WHERE type = ? AND deletedAt IS NULL AND id IN (${chunk.map(() => '?').join(',')})`,
      type,
      ...chunk,
    );
    rows.forEach((r) => out.set(r.id, JSON.parse(r.data) as T));
  }
  return ids.map((id) => out.get(id)).filter((d): d is T => !!d);
}

export async function listDocs<T>(type: DocType, where: Index = {}): Promise<T[]> {
  const db = await getDb();
  const clauses = ['type = ?', 'deletedAt IS NULL'];
  const params: string[] = [type];
  if (where.childId) {
    clauses.push('childId = ?');
    params.push(where.childId);
  }
  if (where.parentId) {
    clauses.push('parentId = ?');
    params.push(where.parentId);
  }
  const rows = await db.getAllAsync<Row>(`SELECT data FROM docs WHERE ${clauses.join(' AND ')} ORDER BY rowid`, ...params);
  return rows.map((r) => JSON.parse(r.data) as T);
}

export async function putDoc<T extends { id: string; updatedAt?: string }>(type: DocType, doc: T, index: Index = {}): Promise<T> {
  const db = await getDb();
  const updatedAt = doc.updatedAt ?? new Date().toISOString();
  await db.runAsync(
    `INSERT INTO docs (type, id, childId, parentId, data, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT (type, id) DO UPDATE SET childId = excluded.childId, parentId = excluded.parentId,
       data = excluded.data, updatedAt = excluded.updatedAt, deletedAt = NULL`,
    type,
    doc.id,
    index.childId ?? null,
    index.parentId ?? null,
    JSON.stringify(doc),
    updatedAt,
  );
  notify(type);
  return doc;
}

export async function putDocs<T extends { id: string; updatedAt?: string }>(
  type: DocType,
  docs: readonly T[],
  index: (doc: T) => Index = () => ({}),
): Promise<void> {
  if (!docs.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const doc of docs) {
      const ix = index(doc);
      await db.runAsync(
        `INSERT INTO docs (type, id, childId, parentId, data, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (type, id) DO UPDATE SET childId = excluded.childId, parentId = excluded.parentId,
           data = excluded.data, updatedAt = excluded.updatedAt, deletedAt = NULL`,
        type,
        doc.id,
        ix.childId ?? null,
        ix.parentId ?? null,
        JSON.stringify(doc),
        doc.updatedAt ?? new Date().toISOString(),
      );
    }
  });
  notify(type);
}

/** Soft delete: keeps a tombstone so a later sync can propagate the delete (FR-44). */
export async function deleteDoc(type: DocType, id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync('UPDATE docs SET deletedAt = ?, updatedAt = ? WHERE type = ? AND id = ?', now, now, type, id);
  notify(type);
}

export async function deleteDocsWhere(type: DocType, where: Index): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  if (where.childId) await db.runAsync('UPDATE docs SET deletedAt = ?, updatedAt = ? WHERE type = ? AND childId = ?', now, now, type, where.childId);
  if (where.parentId) await db.runAsync('UPDATE docs SET deletedAt = ?, updatedAt = ? WHERE type = ? AND parentId = ?', now, now, type, where.parentId);
  notify(type);
}
