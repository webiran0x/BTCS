// دستیار هوش مصنوعی داخلی.
//  • هوش مصنوعی محلی: روی مرورگر بازدیدکننده با WebGPU (WebLLM) اجرا می‌شود. رایگان، خصوصی، بدون نیاز به کلید API.
//  • اختیاری: هرگونه اندپوینت سازگار با OpenAI (مانند سرور شخصی Ollama) که در تنظیمات هوش مصنوعی تعیین شود.
//  • همیشه در دسترس: تحلیل‌گر مبتنی بر قانون (آنی، قابل اجرا روی هر دستگاهی).
import { CONFIG } from '../config.js';
import { settings } from '../store.js';
import { AI_SYSTEM_PROMPT } from '../lib/analyst.js';

export const aiState = new EventTarget();
aiState.status = 'idle'; // idle | unsupported | loading | ready | error
aiState.progress = 0;
aiState.text = '';
aiState.model = null;

let engine = null;
let webllm = null;
let loadingPromise = null;

function emit(status, extra = {}) {
  Object.assign(aiState, { status, ...extra });
  aiState.dispatchEvent(new CustomEvent('change'));
}

export async function deviceSupport() {
  const info = { webgpu: false, f16: false, mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent), memoryGB: navigator.deviceMemory || null };
  if (!('gpu' in navigator)) return info;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) { info.webgpu = true; info.f16 = adapter.features.has('shader-f16'); }
  } catch { /* بدون آداپتور */ }
  return info;
}

export async function recommendedModelId() {
  const s = await deviceSupport();
  if (!s.webgpu) return null;
  const small = s.mobile || (s.memoryGB && s.memoryGB <= 4);
  return (small ? CONFIG.LLM_MODELS.find((m) => m.tier === 'small') : CONFIG.LLM_MODELS[0]).id;
}

export function isModelCached(id) {
  return webllm?.hasModelInCache ? webllm.hasModelInCache(id).catch(() => false) : Promise.resolve(false);
}

export async function loadLocalModel(modelId) {
  if (engine && aiState.model === modelId) return engine;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const support = await deviceSupport();
    if (!support.webgpu) {
      emit('unsupported', { text: 'این مرورگر/دستگاه از WebGPU پشتیبانی نمی‌کند، بنابراین مدل محلی نمی‌تواند اجرا شود. به جای آن از تحلیل‌گر قانون‌محور استفاده می‌شود.' });
      throw new Error('WebGPU در دسترس نیست');
    }
    emit('loading', { progress: 0, text: 'در حال بارگذاری موتور هوش مصنوعی...' });
    try {
      webllm = webllm || (await import(/* @vite-ignore */ CONFIG.WEBLLM_URL));
      let id = modelId || (await recommendedModelId());
      if (!support.f16) id = id.replace('q4f16_1', 'q4f32_1');
      const known = webllm.prebuiltAppConfig?.model_list?.map((m) => m.model_id) || [];
      if (known.length && !known.includes(id)) {
        id = [CONFIG.LLM_MODELS[0].id, 'Qwen3-1.7B-q4f16_1-MLC', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'].map((x) => (support.f16 ? x : x.replace('q4f16_1', 'q4f32_1'))).find((x) => known.includes(x)) || known[0];
      }
      if (engine) { try { await engine.unload(); } catch { /* نادیده گرفتن */ } }
      engine = await webllm.CreateMLCEngine(id, {
        initProgressCallback: (r) => emit('loading', { progress: r.progress ?? 0, text: r.text || 'در حال دانلود مدل...' }),
      });
      emit('ready', { model: id, progress: 1, text: 'آماده' });
      settings.set({ llmModel: id, llmAuto: true });
      return engine;
    } catch (err) {
      engine = null;
      emit('error', { text: `راه‌اندازی هوش مصنوعی محلی با خطا مواجه شد: ${err.message}` });
      throw err;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

// هر مدلی که ارائه می‌شود دارای یک پنجره ۴۰۹۶ توکنی است.
export const CONTEXT_TOKENS = 4096;
export const ANSWER_TOKENS = 700;
const SLACK = 64; // نشانگرهای قالب چت

export function estimateTokens(text) {
  let n = 0;
  for (const ch of String(text ?? '')) {
    if (ch >= '0' && ch <= '9') n += 1;
    else if (/[A-Za-z]/.test(ch)) n += 1 / 6;
    else if (ch < '\u0080') n += 0.7;
    else n += 1.5;
  }
  return Math.ceil(n);
}

const TRIM = [['aiForecast', 'models'], ['aiForecast', 'patternMatches'], ['aiForecast', 'notes'], ['recentHeadlines'], ['multiYearHistory'], ['moveTiming'], ['timeframes']];

function shortenArrays(v, max) {
  if (Array.isArray(v)) return v.slice(0, max).map((x) => shortenArrays(x, max));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shortenArrays(x, max)]));
  return v;
}

export function fitJson(data, limit = 5000, size = (x) => x.length) {
  let d = JSON.parse(JSON.stringify(data ?? {}));
  let s = JSON.stringify(d);
  for (const path of TRIM) {
    if (size(s) <= limit) return s;
    const parent = path.length > 1 ? d[path[0]] : d;
    if (parent && typeof parent === 'object') delete parent[path[path.length - 1]];
    s = JSON.stringify(d);
  }
  for (const max of [8, 5, 3]) {
    if (size(s) <= limit) return s;
    d = shortenArrays(d, max);
    s = JSON.stringify(d);
  }
  const keep = ['coin', 'question', 'comparison', 'marketByTimeframe', 'marketPicks', 'portfolio', 'signal', 'aiForecast', 'price', 'chart'];
  for (const k of Object.keys(d).filter((key) => !keep.includes(key))) {
    if (size(s) <= limit) return s;
    delete d[k];
    s = JSON.stringify(d);
  }
  for (const k of [...keep].reverse()) {
    if (size(s) <= limit) return s;
    delete d[k];
    s = JSON.stringify(d);
  }
  return size(s) <= limit ? s : '{}';
}

function fitText(text, limit) {
  if (estimateTokens(text) <= limit) return text;
  const out = [];
  let used = 1;
  for (const line of String(text).split('\n')) {
    used += estimateTokens(line) + 1;
    if (used > limit) break;
    out.push(line);
  }
  return `${out.join('\n')}\n…`;
}

export function buildMessages(history, question, facts, data, { context = CONTEXT_TOKENS, answer = ANSWER_TOKENS } = {}) {
  let left = context - answer - SLACK - estimateTokens(AI_SYSTEM_PROMPT) - estimateTokens(question) - 20;
  const f = fitText(facts, Math.floor(left * 0.45));
  left -= estimateTokens(f);
  const recent = [];
  let room = Math.floor(left * 0.35);
  for (const m of history.slice(-6).reverse()) {
    const content = m.content.length > 1200 ? `${m.content.slice(0, 1200)}…` : m.content;
    const t = estimateTokens(content) + 6;
    if (t > room) break;
    recent.unshift({ role: m.role, content });
    room -= t; left -= t;
  }
  while (recent[0] && recent[0].role !== 'user') left += estimateTokens(recent.shift().content) + 6;
  const user = `FACTS (تحلیل تأییدشده):\n${f}\n\nDATA (JSON):\n${fitJson(data, Math.max(0, left), estimateTokens)}\n\nQUESTION: ${question}`;
  return [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...recent, { role: 'user', content: user }];
}

const tooLong = (err) => err?.name === 'ContextWindowSizeExceededError' || /context (window|length)|maximum context|too many tokens|prompt is too long/i.test(String(err?.message || ''));

const stripThink = (t) => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');

export const AI_HOSTS = ['api.openai.com', 'api.groq.com', 'openrouter.ai', 'api.together.xyz', 'api.mistral.ai', 'api.deepseek.com', 'generativelanguage.googleapis.com'];
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

export function checkCustomAI({ url = '', model = '', key = '' } = {}) {
  const u = String(url).trim();
  if (!u) return { ok: false, field: 'url', error: 'آدرس سرور را وارد کنید، مثلا http://localhost:11434/v1.' };
  let p;
  try { p = new URL(u); } catch { return { ok: false, field: 'url', error: 'این یک آدرس وب معتبر نیست. باید با http:// یا https:// شروع شود.' }; }
  if (p.protocol !== 'http:' && p.protocol !== 'https:') return { ok: false, field: 'url', error: 'فقط آدرس‌های http:// و https:// قابل استفاده هستند.' };
  if (p.username || p.password) return { ok: false, field: 'url', error: 'کلید API را در کادر مربوطه وارد کنید، نه در آدرس.' };
  const local = LOCAL.has(p.hostname);
  if (p.protocol === 'http:' && !local) return { ok: false, field: 'url', error: 'آدرس http ساده فقط روی همین کامپیوتر (localhost) مجاز است. برای سرورهای دیگر از https استفاده کنید.' };
  if (!local && !AI_HOSTS.includes(p.hostname)) return { ok: false, field: 'url', error: `مرورگر تنها اجازه دسترسی به سرورهای محلی یا ${AI_HOSTS.join(', ')} را می‌دهد.` };
  const m = String(model).trim();
  if (m && !/^[\w.:/@+-]{1,120}$/.test(m)) return { ok: false, field: 'model', error: 'نام مدل فقط شامل حروف، اعداد و کاراکترهای . : / @ + - _ است.' };
  const k = String(key).trim();
  if (k && !/^[\x21-\x7e]{8,400}$/.test(k)) return { ok: false, field: 'key', error: 'کلید API نباید فاصله داشته باشد و حداقل باید ۸ کاراکتر باشد.' };
  return { ok: true, url: `${p.origin}${p.pathname.replace(/\/+$/, '')}`, model: m, key: k };
}

export async function askLLM({ history, question, facts, data, onText, signal }) {
  const custom = settings.get().customEndpoint;
  let err;
  for (const context of [CONTEXT_TOKENS, Math.round(CONTEXT_TOKENS * 0.6)]) {
    const messages = buildMessages(history, question, facts, data, { context });
    try {
      return await (custom ? askEndpoint(messages, { onText, signal }) : askLocal(messages, { onText, signal }));
    } catch (e) {
      if (signal?.aborted || !tooLong(e)) throw e;
      err = e;
    }
  }
  throw err;
}

const UNREACHABLE = 'از طریق مرورگر قابل دسترس نیست. بررسی کنید که سرور در حال اجرا باشد و اجازه دسترسی به این سایت را بدهد.';
const WAIT_MS = 90e3;

async function askEndpoint(messages, { onText, signal }) {
  const s = settings.get();
  const ok = checkCustomAI({ url: s.customEndpoint, model: s.customModel, key: s.customKey });
  if (!ok.ok) {
    customState.reached = false;
    customState.lastError = ok.error;
    throw new Error(ok.error);
  }
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => ctl.abort(new Error('timeout')), WAIT_MS);
  try {
    let res;
    try {
      res = await fetch(`${ok.url}/chat/completions`, {
        method: 'POST', signal: ctl.signal,
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
        headers: { 'content-type': 'application/json', ...(s.customKey ? { authorization: `Bearer ${s.customKey}` } : {}) },
        body: JSON.stringify({ model: s.customModel || 'default', messages, stream: true, temperature: 0.3, max_tokens: ANSWER_TOKENS }),
      });
    } catch (err) {
      customState.reached = false;
      customState.lastError = ctl.signal.reason?.message === 'timeout' && !signal?.aborted ? `عدم دریافت پاسخ در مدت ${WAIT_MS / 1000} ثانیه`
        : /Failed to fetch|NetworkError|Load failed/i.test(String(err && err.message)) ? UNREACHABLE : String(err && err.message || err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      customState.reached = false;
      customState.lastError = `خطای پاسخگویی سرور ${res.status}${detail ? `: ${detail}` : ''}`;
      throw new Error(`خطای اندپوینت هوش مصنوعی ${res.status} ${detail}`);
    }
    customState.reached = true;
    customState.lastError = null;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', finish = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (text.length > 20000) { ctl.abort(); break; }
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const m = /^data:\s*(.*)$/.exec(line.trim());
        if (!m || m[1] === '[DONE]') continue;
        try {
          const choice = JSON.parse(m[1]).choices?.[0];
          finish = choice?.finish_reason || finish;
          const delta = choice?.delta?.content;
          if (delta) { text += delta; onText?.(stripThink(text)); }
        } catch {}
      }
    }
    return { text: stripThink(text), source: s.customModel || 'سرور هوش مصنوعی شما', where: 'endpoint', cut: finish === 'length' };
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}

async function askLocal(messages, { onText, signal }) {
  if (!engine) throw new Error('هوش مصنوعی محلی بارگذاری نشده است');
  const stream = await engine.chat.completions.create({
    messages, stream: true, temperature: 0.3, top_p: 0.9, max_tokens: ANSWER_TOKENS,
    ...(/^Qwen3/i.test(aiState.model || '') ? { extra_body: { enable_thinking: false } } : {}),
  });
  let text = '', finish = null;
  for await (const chunk of stream) {
    if (signal?.aborted) { try { engine.interruptGenerate(); } catch {} break; }
    const choice = chunk.choices?.[0];
    finish = choice?.finish_reason || finish;
    const delta = choice?.delta?.content || '';
    if (delta) { text += delta; onText?.(stripThink(text)); }
  }
  if (signal?.aborted) throw new DOMException('توقف', 'AbortError');
  return { text: stripThink(text), source: aiState.model, where: 'device', cut: finish === 'length' };
}

export const localReady = () => !!engine && aiState.status === 'ready';
export const customReady = () => !!settings.get().customEndpoint;
export const customState = { reached: false, lastError: null };