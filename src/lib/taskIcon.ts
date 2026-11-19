/**
 * Picks a picture for a task that has no photo, from the words in its title
 * (then its description). The worker may not read, so every task needs a
 * picture; this keeps photos optional for the admin.
 *
 * Words are ranked so the thing being handled wins over where it is:
 * objects first ("router", "shoes"), then chore actions ("sweep", "iron"),
 * then places and people ("kitchen", "kids"), then generic verbs ("clean").
 * Within a rank, the word that comes first in the text wins. Keywords cover
 * English, common Hinglish words and Hindi in Devanagari.
 */

type Rule = [icon: string, keywords: string[]];

/** Things: the object of the chore. Strongest signal. */
const OBJECTS: Rule[] = [
  ['🛜', ['router', 'wifi', 'wi-fi', 'modem', 'internet', 'broadband']],
  ['📺', ['tv', 'television', 'remote', 'set top box', 'settop box']],
  ['💻', ['laptop', 'computer', 'monitor', 'printer', 'keyboard']],
  ['📱', ['phone', 'mobile', 'ipad']],
  ['🔋', ['battery', 'batteries', 'inverter']],
  ['🔌', ['plug', 'socket', 'charger', 'cable', 'wire', 'extension', 'adapter', 'switch', 'board', 'grinder', 'mixer', 'iron box']],
  ['💡', ['bulb', 'light', 'lights', 'lamp', 'tubelight', 'batti', 'बत्ती']],
  ['🌬️', ['air purifier', 'purifier', 'humidifier', 'heater', 'cooler']],
  ['🌀', ['fan', 'pankha', 'पंखा', 'ac', 'air conditioner', 'ac filter', 'cobweb', 'jaala', 'जाला']],
  ['🧊', ['fridge', 'refrigerator', 'freezer', 'ice', 'फ्रिज']],
  ['🍽️', ['dish', 'utensil', 'plate', 'bowl', 'cup', 'glass', 'spoon', 'bartan', 'crockery', 'बर्तन', 'thali', 'tiffin', 'lunchbox', 'lunch box']],
  ['👕', ['shirt', 't-shirt', 'tshirt', 'kurta', 'uniform', 'dress', 'trousers', 'pants', 'jeans', 'saree', 'sari', 'socks']],
  ['🧺', ['laundry', 'washing machine', 'clothes', 'kapde', 'kapda', 'कपड़े', 'कपडे', 'towel', 'towels', 'tauliya', 'तौलिया', 'napkin']],
  ['🛏️', ['bed', 'bedsheet', 'sheet', 'pillow', 'pillow cover', 'mattress', 'blanket', 'quilt', 'razai', 'bistar', 'चादर', 'बिस्तर', 'chadar']],
  ['🚪', ['door', 'wardrobe', 'almirah', 'almari', 'cupboard', 'closet', 'cabinet', 'drawer', 'shelf', 'rack', 'अलमारी']],
  ['🔑', ['key', 'keys', 'lock', 'chabi', 'चाबी']],
  ['👟', ['shoe', 'joote', 'जूते', 'chappal', 'slipper', 'sandal', 'boot']],
  ['🧸', ['toy', 'toys', 'khilona', 'खिलौने', 'lego']],
  ['📚', ['book', 'notebook', 'copy', 'homework', 'kitab', 'किताब']],
  ['🎒', ['school bag', 'bag', 'backpack', 'basta']],
  ['📦', ['box', 'parcel', 'courier', 'package', 'delivery', 'carton', 'amazon']],
  ['📰', ['newspaper', 'paper', 'akhbar', 'अख़बार']],
  ['🪞', ['mirror', 'window', 'shisha', 'sheesha', 'शीशा', 'खिड़की', 'khidki']],
  ['🪟', ['curtain', 'parda', 'पर्दा', 'blind']],
  ['🛋️', ['sofa', 'couch', 'cushion', 'chair', 'table', 'furniture']],
  ['🗑️', ['trash', 'garbage', 'rubbish', 'dustbin', 'bin', 'kachra', 'kooda', 'कचरा', 'कूड़ा', 'plastic', 'garbage bag', 'bin bag', 'polythene']],
  ['🧻', ['tissue', 'toilet paper', 'toilet roll']],
  ['🚽', ['toilet', 'commode', 'shauchalay', 'शौचालय', 'टॉयलेट']],
  ['🚰', ['sink', 'tap', 'basin', 'drain', 'water filter', 'nal', 'नल']],
  ['💧', ['water bottle', 'bottle', 'bottles', 'water tank', 'tank', 'paani', 'पानी']],
  ['🧴', ['soap', 'detergent', 'shampoo', 'handwash', 'sanitiser', 'sanitizer', 'liquid']],
  ['💊', ['medicine', 'dawai', 'दवाई', 'tablets', 'pills']],
  ['🥛', ['milk', 'doodh', 'दूध', 'curd', 'dahi', 'दही']],
  ['☕', ['tea', 'chai', 'चाय', 'coffee']],
  ['🍞', ['bread', 'toast', 'sandwich']],
  ['🥚', ['egg', 'anda', 'अंडा']],
  ['🍎', ['fruit', 'apple', 'banana', 'phal', 'फल']],
  ['🥦', ['vegetable', 'veggies', 'sabzi', 'सब्ज़ी', 'सब्जी']],
  ['🍚', ['rice', 'chawal', 'चावल', 'dal', 'दाल', 'atta', 'आटा']],
  ['🫓', ['roti', 'chapati', 'paratha', 'रोटी']],
  ['🔥', ['stove', 'gas', 'cylinder', 'burner', 'chulha', 'चूल्हा']],
  ['🍳', ['breakfast', 'lunch', 'dinner', 'meal', 'khana', 'खाना', 'nashta', 'नाश्ता', 'pan', 'tawa', 'kadhai', 'cooker']],
  ['🌱', ['plant', 'garden', 'paudhe', 'पौधे', 'gamla', 'flower', 'pot']],
  ['🐕', ['dog', 'puppy', 'kutta', 'कुत्ता']],
  ['🐈', ['cat', 'kitten', 'billi', 'बिल्ली']],
  ['🚗', ['car', 'vehicle', 'gaadi', 'gadi', 'गाड़ी', 'bike', 'scooter', 'cycle']],
  ['🧹', ['broom', 'carpet', 'rug', 'doormat', 'jhadu', 'jharu', 'झाड़ू', 'झाडू']],
  ['🪣', ['mop', 'pocha', 'pochha', 'पोछा', 'पोंछा', 'floor', 'bucket', 'balti']],
  ['🪔', ['camphor', 'kapoor', 'कपूर', 'diya', 'agarbatti', 'incense', 'pooja', 'puja', 'पूजा', 'mandir', 'temple']],
  ['🦟', ['mosquito', 'machhar', 'मच्छर', 'cockroach', 'pest', 'insect', 'ants']],
];

/** Chore actions, used when no object is named. */
const ACTIONS: Rule[] = [
  ['🧺', ['fold', 'iron', 'press', 'प्रेस']],
  ['🧹', ['sweep', 'vacuum', 'hoover']],
  ['🪣', ['mopping']],
  ['🧽', ['dust', 'wipe', 'wiping', 'scrub', 'polish']],
  ['🍳', ['cook', 'fry', 'boil', 'bake', 'pakana']],
  ['🔪', ['chop', 'cut', 'peel', 'kaatna']],
  ['🛒', ['grocery', 'groceries', 'shopping', 'buy', 'market', 'saman', 'सामान', 'bazaar', 'बाजार', 'order']],
  ['💧', ['water the', 'fill water', 'refill']],
  ['🐕', ['walk the', 'feed the']],
  ['🔧', ['fix', 'repair', 'mend', 'theek', 'ठीक', 'install']],
  ['📞', ['call', 'phone call']],
];

/** Places and people: weaker than what is being done there. */
const PLACES: Rule[] = [
  ['🚽', ['bathroom', 'washroom', 'बाथरूम']],
  ['🚿', ['shower', 'tub', 'bath', 'nahana']],
  ['🍴', ['kitchen', 'rasoi', 'रसोई', 'counter', 'chimney']],
  ['🛋️', ['living room', 'drawing room', 'hall', 'lounge']],
  ['🛏️', ['bedroom']],
  ['🪴', ['balcony', 'terrace', 'chhat', 'छत']],
  ['👶', ['baby', 'child', 'children', 'kids', 'kid', 'bachcha', 'बच्चा', 'diaper', 'school']],
  ['🐾', ['pet']],
];

/** Generic verbs: last resort before the house. */
const GENERIC: Rule[] = [
  ['🧼', ['clean', 'wash', 'saaf', 'safai', 'साफ', 'सफाई', 'dhona', 'धोना', 'dhulai']],
  ['📦', ['move', 'shift', 'take out', 'bring', 'put away', 'organise', 'organize', 'arrange', 'tidy']],
];

const TIERS = [OBJECTS, ACTIONS, PLACES, GENERIC];

export const DEFAULT_TASK_ICON = '🏠';

/** Where the keyword first appears in the text, or -1. */
function position(text: string, kw: string): number {
  // Latin keywords match whole words, allowing common endings ("mop" matches
  // "mopping" but "bin" does not match "cabinet" and "car" not "care").
  // Devanagari has no word boundaries in JS regex, so a substring match is used.
  if (/^[\x00-\x7f]+$/.test(kw)) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(^|[^a-z])${esc}(s|es|ing|ed|er|ers|[a-z]ing|[a-z]ed)?(?=[^a-z]|$)`).exec(text);
    return m ? m.index + m[1].length : -1;
  }
  return text.indexOf(kw);
}

function find(text: string): string | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  for (const rules of TIERS) {
    let best: { icon: string; at: number } | null = null;
    for (const [icon, kws] of rules) {
      for (const k of kws) {
        const at = position(t, k);
        if (at >= 0 && (!best || at < best.at)) best = { icon, at };
      }
    }
    if (best) return best.icon;
  }
  return null;
}

/** The picture shown for a task without a photo. */
export function taskIcon(t: { title: string; description?: string | null }): string {
  return find(t.title) ?? find(t.description ?? '') ?? DEFAULT_TASK_ICON;
}
