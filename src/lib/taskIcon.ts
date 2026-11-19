/**
 * Picks a picture for a task that has no photo, from the words in its title
 * (then its description). The worker may not read, so every task needs a
 * picture; this keeps photos optional for the admin.
 *
 * Rules are checked in order, so more specific chores come before broad ones
 * ("bathroom" before "clean", "dishes" before "kitchen"). Keywords cover
 * English, common Hinglish words and Hindi in Devanagari.
 */

const RULES: [icon: string, keywords: string[]][] = [
  ['🍽️', ['dish', 'dishes', 'utensil', 'plates', 'bartan', 'crockery', 'बर्तन', 'thali']],
  ['🧺', ['laundry', 'washing machine', 'clothes', 'kapde', 'kapda', 'कपड़े', 'कपडे', 'fold', 'iron', 'press', 'प्रेस']],
  ['🚽', ['toilet', 'bathroom', 'washroom', 'commode', 'shauchalay', 'बाथरूम', 'शौचालय', 'टॉयलेट']],
  ['🚿', ['shower', 'tub', 'bath', 'nahana']],
  ['🪞', ['mirror', 'glass', 'window', 'shisha', 'sheesha', 'शीशा', 'खिड़की', 'khidki']],
  ['🛏️', ['bed', 'bedsheet', 'sheets', 'pillow', 'mattress', 'bistar', 'चादर', 'बिस्तर', 'chadar']],
  ['🗑️', ['trash', 'garbage', 'rubbish', 'dustbin', 'bin', 'kachra', 'kooda', 'कचरा', 'कूड़ा']],
  ['🪣', ['mop', 'mopping', 'pocha', 'pochha', 'पोछा', 'पोंछा', 'floor']],
  ['🧹', ['sweep', 'broom', 'vacuum', 'hoover', 'carpet', 'rug', 'jhadu', 'jharu', 'झाड़ू', 'झाडू']],
  ['🧽', ['dust', 'wipe', 'wiping', 'scrub', 'polish']],
  ['🍳', ['cook', 'cooking', 'breakfast', 'lunch', 'dinner', 'meal', 'khana', 'खाना', 'nashta', 'नाश्ता', 'roti', 'रोटी', 'sabzi', 'सब्ज़ी', 'dal', 'दाल', 'rice', 'chawal']],
  ['🔪', ['chop', 'cut vegetables', 'peel', 'kaatna']],
  ['🧊', ['fridge', 'refrigerator', 'freezer', 'फ्रिज']],
  ['☕', ['tea', 'chai', 'चाय', 'coffee']],
  ['🛒', ['grocery', 'groceries', 'shopping', 'buy', 'market', 'sabzi lana', 'saman', 'सामान', 'bazaar', 'बाजार']],
  ['🥛', ['milk', 'doodh', 'दूध']],
  ['🌱', ['plant', 'plants', 'garden', 'water the', 'paudhe', 'पौधे', 'gamla']],
  ['🐕', ['dog', 'walk the', 'pet', 'kutta', 'कुत्ता']],
  ['🐈', ['cat', 'billi', 'बिल्ली']],
  ['👶', ['baby', 'child', 'kids', 'bachcha', 'बच्चा', 'diaper', 'school']],
  ['👟', ['shoe', 'shoes', 'joote', 'जूते']],
  ['🚗', ['car', 'vehicle', 'gaadi', 'gadi', 'गाड़ी', 'bike', 'scooter']],
  ['🛋️', ['sofa', 'couch', 'cushion', 'living room', 'drawing room']],
  ['🪟', ['curtain', 'parda', 'पर्दा']],
  ['🌀', ['fan', 'pankha', 'पंखा', 'ac filter', 'cobweb', 'jaala', 'जाला']],
  ['🪴', ['balcony', 'terrace', 'chhat', 'छत']],
  ['🧴', ['soap', 'detergent', 'refill', 'sanitiser', 'sanitizer']],
  ['💊', ['medicine', 'dawai', 'दवाई', 'tablet', 'pills']],
  ['🍴', ['kitchen', 'rasoi', 'रसोई', 'counter', 'stove', 'gas', 'chimney']],
  ['🧼', ['clean', 'wash', 'saaf', 'safai', 'साफ', 'सफाई', 'dhona', 'धोना']],
];

export const DEFAULT_TASK_ICON = '🏠';

function matches(text: string, kw: string): boolean {
  // Latin keywords match whole words, allowing common endings ("mop" matches
  // "mopping" but "bin" does not match "cabinet" and "car" not "care").
  // Devanagari has no word boundaries in JS regex, so a substring match is used.
  if (/^[\x00-\x7f]+$/.test(kw)) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${esc}(s|es|ing|ed|er|ers|[a-z]ing|[a-z]ed)?([^a-z]|$)`).test(text);
  }
  return text.includes(kw);
}

function find(text: string): string | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  for (const [icon, kws] of RULES) if (kws.some((k) => matches(t, k))) return icon;
  return null;
}

/** The picture shown for a task without a photo. */
export function taskIcon(t: { title: string; description?: string | null }): string {
  return find(t.title) ?? find(t.description ?? '') ?? DEFAULT_TASK_ICON;
}
