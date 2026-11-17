import { useEffect, useState } from 'react';
import { detectLang, type Lang } from './lang';
import { supabase } from './supabase';
import type { TaskFull } from './types';

/** What the speaker button reads: the task's title and description, in one language. */
interface Spoken { title: string; description: string; lang: Lang }

const KEY = 'handmaiden-tr';
const key = (t: { id: string; version: number }, lang: Lang) => `${KEY}:${t.id}:${t.version}:${lang}`;

function cached(t: TaskFull, lang: Lang): Spoken | null {
  try {
    const v = localStorage.getItem(key(t, lang));
    return v ? (JSON.parse(v) as Spoken) : null;
  } catch { return null; }
}

/** The text to read for a task: as typed, or translated into the worker's language when one is set. */
function original(t: TaskFull): Spoken {
  return { title: t.title, description: t.description, lang: detectLang(`${t.title} ${t.description}`) };
}

/**
 * Fetches translations the phone doesn't have yet and keeps them, so the
 * speaker works straight away (and offline) later. Failures are ignored:
 * the speaker then reads the text as typed.
 */
export async function prefetchTranslations(tasks: TaskFull[], lang: Lang | null | undefined): Promise<void> {
  if (!lang) return;
  const missing = tasks.filter((t) => original(t).lang !== lang && !cached(t, lang));
  for (let i = 0; i < missing.length; i += 40) {
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ task_ids: missing.slice(i, i + 40).map((t) => t.id), lang }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { tasks: (Spoken & { id: string; version: number })[] };
      for (const r of body.tasks) {
        try {
          localStorage.setItem(key(r, lang), JSON.stringify({ title: r.title, description: r.description, lang: r.lang }));
        } catch { /* storage full: translate again next time */ }
      }
    } catch { return; }
  }
}

/** The text to read, if it can be had without the network. */
function spokenNow(t: TaskFull, lang: Lang | null | undefined): Spoken | null {
  if (!lang || original(t).lang === lang) return original(t);
  return cached(t, lang);
}

// --- Speaking --------------------------------------------------------------

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voices: SpeechSynthesisVoice[] = synth?.getVoices() ?? [];
synth?.addEventListener?.('voiceschanged', () => { voices = synth.getVoices(); });

const BCP47: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN' };

/** Best voice for a language: Indian voices first, then any voice of that language. */
function voiceFor(lang: Lang): SpeechSynthesisVoice | undefined {
  const tag = BCP47[lang].toLowerCase();
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  return voices.find((v) => norm(v) === tag && /google/i.test(v.name))
    ?? voices.find((v) => norm(v) === tag)
    ?? voices.find((v) => norm(v).startsWith(`${lang}-`) || norm(v) === lang);
}

export const canSpeak = Boolean(synth);

/** Who is speaking now, so every speaker button can show it. */
let current: string | null = null;
const listeners = new Set<(id: string | null) => void>();
const setCurrent = (id: string | null) => { current = id; listeners.forEach((f) => f(id)); };

export function stopSpeaking() {
  synth?.cancel();
  setCurrent(null);
}

/** Reads a task aloud in the worker's language. Tapping again while it plays stops it. */
export async function speakTask(t: TaskFull, lang: Lang | null | undefined): Promise<void> {
  if (!synth) return;
  if (current === t.id) { stopSpeaking(); return; }
  synth.cancel();
  setCurrent(t.id);
  let s = spokenNow(t, lang);
  if (!s) {
    // iPhones only allow speech started by a tap: start it now, speak after the network.
    synth.speak(new SpeechSynthesisUtterance(''));
    await prefetchTranslations([t], lang);
    if (current !== t.id) return; // another button was tapped meanwhile
    s = cached(t, lang!) ?? original(t);
  }
  const text = [s.title, s.description].map((x) => x.trim()).filter(Boolean).join('. ');
  const u = new SpeechSynthesisUtterance(text);
  u.lang = BCP47[s.lang];
  const v = voiceFor(s.lang);
  if (v) u.voice = v;
  u.rate = 0.9;
  u.onend = u.onerror = () => { if (current === t.id) setCurrent(null); };
  synth.speak(u);
}

/** The id of the task being read aloud, or null. */
export function useSpeaking(): string | null {
  const [id, setId] = useState(current);
  useEffect(() => {
    listeners.add(setId);
    return () => { listeners.delete(setId); };
  }, []);
  return id;
}
