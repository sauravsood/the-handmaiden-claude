// Completions made without a signal wait in IndexedDB and are sent when the
// phone is back online.
import { uploadPhoto } from './media';
import { supabase } from './supabase';

interface Pending {
  occurrenceId: string;
  householdId: string;
  photo: Blob | null;
  steps: string[];
  at: number;
}

const DB = 'handmaiden';
const STORE = 'pending';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'occurrenceId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const pendingList = () => tx<Pending[]>('readonly', (s) => s.getAll() as IDBRequest<Pending[]>).catch(() => [] as Pending[]);
const put = (p: Pending) => tx('readwrite', (s) => s.put(p));
const remove = (id: string) => tx('readwrite', (s) => s.delete(id));

function isNetworkError(e: unknown) {
  return !navigator.onLine || (e instanceof TypeError) || /fetch|network|Failed to/i.test(String((e as Error)?.message ?? e));
}

async function send(p: Pending) {
  const path = p.photo ? await uploadPhoto(p.householdId, 'proof', p.photo) : null;
  const { error } = await supabase.rpc('complete_occurrence', { p_id: p.occurrenceId, p_proof_path: path, p_steps: p.steps });
  if (error) throw new Error(error.message);
}

/**
 * Marks an occurrence done. Returns 'sent', or 'queued' when the phone is
 * offline. Other errors are thrown.
 */
export async function completeOccurrence(p: Omit<Pending, 'at'>): Promise<'sent' | 'queued'> {
  const item = { ...p, at: Date.now() };
  try {
    await send(item);
    return 'sent';
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await put(item);
    return 'queued';
  }
}

let flushing = false;
/** Sends queued completions. Returns how many are still waiting. */
export async function flushPending(): Promise<number> {
  if (flushing || !navigator.onLine) return (await pendingList()).length;
  flushing = true;
  try {
    for (const p of await pendingList()) {
      try {
        await send(p);
        await remove(p.occurrenceId);
      } catch (e) {
        if (isNetworkError(e)) break;
        await remove(p.occurrenceId); // rejected by the server, e.g. already done
      }
    }
  } finally {
    flushing = false;
  }
  return (await pendingList()).length;
}
