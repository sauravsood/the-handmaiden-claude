/** Languages tasks can be read aloud in. Shared by the app and the translate function. */
export type Lang = 'en' | 'hi';

export const LANG_NAMES: Record<Lang, string> = { en: 'English', hi: 'हिन्दी Hindi' };

/** Hindi if the text has Devanagari letters, otherwise English. */
export function detectLang(text: string): Lang {
  return /[ऀ-ॿ]/.test(text) ? 'hi' : 'en';
}
