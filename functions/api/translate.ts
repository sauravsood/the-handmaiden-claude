// POST /api/translate: { task_ids: string[], lang: 'en' | 'hi' }
// Returns each readable task's title and description in that language, so the
// worker screen can read it aloud. Tasks are read as the calling user (row
// level security applies), so a worker only gets their own tasks. Text already
// in the target language is returned as is. Phones keep the results, keyed by
// task version, so each task is translated once per edit.
import { json, userClient, type Env } from '../_shared';
import { detectLang, type Lang } from '../../src/lib/lang';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK = '@cf/meta/m2m100-1.2b';

const STYLE: Record<Lang, string> = {
  hi: 'simple, polite, everyday spoken Hindi in Devanagari script, the way people in an Indian home speak to a house helper. '
    + 'Use the respectful "aap" form. Use common words, and keep English words that Indians normally say in Hindi '
    + '(for example bathroom, mirror, fridge, washing machine) written in Devanagari.',
  en: 'simple, plain everyday English with short sentences.',
};

interface Row { id: string; version: number; title: string; description: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_allowed' }, 401);
  const body = (await request.json().catch(() => ({}))) as { task_ids?: unknown; lang?: unknown };
  const lang = body.lang === 'hi' || body.lang === 'en' ? body.lang : null;
  const ids = Array.isArray(body.task_ids) ? body.task_ids.filter((x): x is string => typeof x === 'string').slice(0, 40) : [];
  if (!lang || ids.length === 0) return json({ error: 'Send task_ids and lang (en or hi).' }, 400);

  const { data, error } = await userClient(env, jwt).from('tasks')
    .select('id, version, title, description').in('id', ids);
  if (error) return json({ error: error.message }, 403);

  const out = await Promise.all((data as Row[]).map(async (t) => {
    const source = detectLang(`${t.title} ${t.description}`);
    if (source === lang) return { ...t, lang };
    try {
      return { ...t, ...(await translate(env, t, lang)), lang };
    } catch {
      return null; // the phone reads the original text and asks again later
    }
  }));
  return json({ tasks: out.filter(Boolean) });
};

async function translate(env: Env, t: Row, lang: Lang): Promise<{ title: string; description: string }> {
  try {
    const res = (await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content: `You translate household chore instructions into ${STYLE[lang]} `
            + 'Keep names, numbers and times. Do not add anything. '
            + 'Reply with only a JSON object with the same keys as the one you are given, each value translated.',
        },
        { role: 'user', content: JSON.stringify(t.description.trim() ? { title: t.title, description: t.description } : { title: t.title }) },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    })) as { response?: unknown };
    const parsed = parseJson(res.response);
    if (parsed && typeof parsed.title === 'string' && detectLang(parsed.title) === lang) {
      return { title: parsed.title, description: t.description ? String(parsed.description ?? '') : '' };
    }
  } catch { /* fall through to the plain translation model */ }

  const one = async (text: string) => {
    if (!text.trim()) return '';
    const r = (await env.AI.run(FALLBACK, {
      text, source_lang: lang === 'hi' ? 'english' : 'hindi', target_lang: lang === 'hi' ? 'hindi' : 'english',
    })) as { translated_text?: string };
    if (!r.translated_text) throw new Error('no translation');
    return r.translated_text;
  };
  return { title: await one(t.title), description: await one(t.description) };
}

function parseJson(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v !== 'string') return null;
  const m = v.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
