import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Shrinks a photo to at most `max` px on its long side, as JPEG. */
export async function compressImage(file: Blob, max = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process photo'))), 'image/jpeg', quality));
}

/** Uploads a photo into the household's folder and returns its storage path. */
export async function uploadPhoto(householdId: string, folder: string, file: Blob): Promise<string> {
  const blob = file.type === 'image/jpeg' && file.size < 400_000 ? file : await compressImage(file);
  const path = `${householdId}/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

// Signed URLs last an hour; cache them for 50 minutes.
const cache = new Map<string, { url: string; until: number }>();
const pending = new Map<string, Promise<string | null>>();

export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  if (!pending.has(path)) {
    pending.set(path, (async () => {
      const { data } = await supabase.storage.from('media').createSignedUrl(path, 3600);
      pending.delete(path);
      if (!data) return null;
      cache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
      return data.signedUrl;
    })());
  }
  return pending.get(path)!;
}

export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? cache.get(path)?.url ?? null : null));
  useEffect(() => {
    let live = true;
    if (!path) { setUrl(null); return; }
    signedUrl(path).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [path]);
  return url;
}
