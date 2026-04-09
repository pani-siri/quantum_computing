import https from "https";
import { pipeline, env as xenv } from "@xenova/transformers";
import { YoutubeTranscript } from "youtube-transcript";

// Read env vars lazily (dotenv hasn't run yet when ES module top-level code executes)
const env = (key, fallback) => process.env[key] || fallback || "";
function getOpenRouterApiKey() { return env("OPENROUTER_API_KEY"); }
function getOpenRouterModel() { return env("OPENROUTER_MODEL", "arcee-ai/trinity-large-preview:free"); }
function getFrontendUrl() { return env("FRONTEND_URL", "http://localhost:3000"); }
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export function getYoutubeApiKey() { return env("YOUTUBE_API_KEY"); }

let embeddingPipelinePromise = null;
const transcriptCache = new Map();
export const conceptCache = new Map();

// ── Embedding ─────────────────────────────────────────────────────────────────
async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    xenv.allowRemoteModels = true;
    xenv.allowLocalModels = true;
    embeddingPipelinePromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return embeddingPipelinePromise;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0, y = Number(b[i]) || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function meanPool(lastHiddenState) {
  if (!lastHiddenState) return [];
  let tokens = lastHiddenState;
  if (Array.isArray(tokens) && Array.isArray(tokens[0]) && Array.isArray(tokens[0][0])) tokens = tokens[0];
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  if (!Array.isArray(tokens[0])) return tokens.map((v) => Number(v) || 0);
  const dims = tokens[0].length || 0;
  if (!dims) return [];
  const out = new Array(dims).fill(0);
  let count = 0;
  for (const t of tokens) {
    if (!Array.isArray(t) || t.length !== dims) continue;
    for (let j = 0; j < dims; j++) out[j] += Number(t[j]) || 0;
    count++;
  }
  if (!count) return [];
  for (let j = 0; j < dims; j++) out[j] /= count;
  return out;
}

export async function embedText(text) {
  const input = String(text || "").trim();
  if (!input) return [];
  try {
    const extractor = await getEmbeddingPipeline();
    const output = await extractor(input, { pooling: "mean", normalize: true });
    if (output?.data && ArrayBuffer.isView(output.data)) return Array.from(output.data);
    if (output?.tolist) return meanPool(output.tolist());
    if (Array.isArray(output)) return meanPool(output);
    return [];
  } catch (err) {
    process.stderr.write(`Embedding failed: ${err?.message || err}\n`);
    return [];
  }
}

// ── Text helpers ──────────────────────────────────────────────────────────────
export function clipText(text, maxChars) {
  const t = String(text || "").trim();
  if (!t) return "";
  const n = Math.max(200, Number(maxChars) || 4000);
  return t.length > n ? t.slice(0, n) : t;
}

export function normalizeTextForMatch(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoChunks(text, maxChars) {
  const t = String(text || "").trim();
  if (!t) return [];
  const n = Math.max(200, Number(maxChars) || 800);
  const chunks = [];
  let i = 0;
  while (i < t.length) { chunks.push(t.slice(i, i + n)); i += n; }
  return chunks;
}

// ── YouTube ───────────────────────────────────────────────────────────────────
export async function fetchTranscriptText(videoIdOrUrl) {
  const key = String(videoIdOrUrl || "").trim();
  if (!key) return "";
  if (transcriptCache.has(key)) { const cached = transcriptCache.get(key); return typeof cached === "string" ? cached : ""; }
  try {
    const items = await YoutubeTranscript.fetchTranscript(key);
    const lines = Array.isArray(items) ? items.map((i) => String(i?.text || "").trim()).filter(Boolean) : [];
    const joined = clipText(lines.join(" "), 12000);
    transcriptCache.set(key, joined);
    return joined;
  } catch { transcriptCache.set(key, ""); return ""; }
}

export function parseYouTubeSearchQuery(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try { return String(new URL(raw).searchParams.get("search_query") || "").trim(); } catch { return ""; }
}

function parseIsoDurationToSeconds(iso) {
  const s = String(iso || "").trim();
  if (!s) return null;
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0, mm = m[2] ? Number(m[2]) : 0, ss = m[3] ? Number(m[3]) : 0;
  if ([h, mm, ss].some((v) => Number.isNaN(v))) return null;
  return h * 3600 + mm * 60 + ss;
}

const MIN_VIDEO_DURATION_SECONDS = 8 * 60;

function durationFitScore(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds <= 0) return 0.5;
  if (seconds < MIN_VIDEO_DURATION_SECONDS) return 0;
  const idealLow = 10 * 60, idealHigh = 25 * 60, max = 60 * 60;
  if (seconds >= idealLow && seconds <= idealHigh) return 1;
  if (seconds < idealLow) return Math.max(0.3, seconds / idealLow);
  if (seconds > idealHigh && seconds <= max) return Math.max(0.2, 1 - (seconds - idealHigh) / (max - idealHigh));
  return 0.2;
}

function transcriptSignalScore(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return { coverage: 0.3, clarity: 0.3, examples: 0.2, structure: 0.2 };
  const definitionHits = (t.match(/\b(is defined as|means|refers to|we define)\b/g) || []).length;
  const exampleHits = (t.match(/\b(for example|e\.g\.|consider|let'?s say)\b/g) || []).length;
  const stepHits = (t.match(/\b(step\s*\d+|first|second|next|then|finally)\b/g) || []).length;
  return {
    structure: Math.min(1, (definitionHits + exampleHits + stepHits) / 20),
    examples: Math.min(1, exampleHits / 8),
    clarity: Math.min(1, (definitionHits + stepHits) / 12),
    coverage: Math.min(1, t.length / 6000)
  };
}

async function computeConceptCoverage(concepts, transcriptText) {
  const list = Array.isArray(concepts) ? concepts.map((c) => String(c || "").trim()).filter(Boolean) : [];
  if (!list.length) return { ratio: 0.5, matched: [] };
  const raw = String(transcriptText || "").trim();
  if (!raw) return { ratio: 0.2, matched: [] };
  const norm = normalizeTextForMatch(raw);
  const matched = [], remaining = [];
  for (const c of list) { const ck = normalizeTextForMatch(c); if (ck && norm.includes(ck)) matched.push(c); else remaining.push(c); }
  if (!remaining.length) return { ratio: matched.length / list.length, matched };
  const chunks = splitIntoChunks(raw, 900).slice(0, 8).map((x) => clipText(x, 1200));
  const chunkVecs = [];
  for (const ch of chunks) chunkVecs.push(await embedText(ch));
  const THRESH = 0.43;
  for (const c of remaining.slice(0, 12)) {
    const cv = await embedText(c);
    let best = 0;
    for (const chv of chunkVecs) { if (cv.length && chv.length) { const sim = cosineSimilarity(cv, chv); if (sim > best) best = sim; } }
    if (best >= THRESH) matched.push(c);
  }
  return { ratio: matched.length / list.length, matched };
}

export async function youtubeSearch(query, maxResults) {
  if (!getYoutubeApiKey()) return [];
  const q = String(query || "").trim();
  if (!q) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(Math.min(15, Math.max(1, Number(maxResults) || 5))));
  url.searchParams.set("q", q);
  url.searchParams.set("videoDuration", "medium");
  url.searchParams.set("key", getYoutubeApiKey());
  const res = await fetch(url.toString());
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { return []; }
  if (!res.ok) return [];
  return (Array.isArray(data?.items) ? data.items : []).map((it) => {
    const vid = it?.id?.videoId, sn = it?.snippet;
    if (!vid) return null;
    return { videoId: String(vid), title: String(sn?.title || ""), description: String(sn?.description || ""), channelTitle: String(sn?.channelTitle || "") };
  }).filter(Boolean);
}

export async function youtubeVideoDetails(videoIds) {
  if (!getYoutubeApiKey()) return new Map();
  const ids = Array.isArray(videoIds) ? videoIds.map((v) => String(v || "").trim()).filter(Boolean) : [];
  if (!ids.length) return new Map();
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", ids.slice(0, 50).join(","));
  url.searchParams.set("key", getYoutubeApiKey());
  const res = await fetch(url.toString());
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { return new Map(); }
  if (!res.ok) return new Map();
  const out = new Map();
  for (const it of (Array.isArray(data?.items) ? data.items : [])) {
    const id = String(it?.id || "").trim();
    if (id) out.set(id, { durationSeconds: parseIsoDurationToSeconds(it?.contentDetails?.duration) });
  }
  return out;
}

export async function extractSubConcepts(subject, subtopicTitle) {
  const s = String(subject || "").trim(), t = String(subtopicTitle || "").trim();
  const key = `${s}||${t}`;
  if (!s || !t) return [];
  if (conceptCache.has(key)) return conceptCache.get(key);
  try {
    const prompt = `Extract 8-15 key sub-concepts (short phrases) that must be covered to properly teach: "${t}" within the subject "${s}".\n\nOUTPUT REQUIREMENTS:\n- Return ONLY valid JSON (no markdown).\n- Output MUST be a JSON array of strings.\n- Each string should be a concrete concept or term a student should learn.\n- Avoid duplicates. Avoid overly generic items.`;
    const content = await callOpenRouter([
      { role: "system", content: "You output strictly valid JSON and nothing else." },
      { role: "user", content: prompt }
    ], { temperature: 0.2 });
    const parsed = stripJson(content);
    const concepts = (Array.isArray(parsed) ? parsed : []).map((c) => String(c || "").trim()).filter(Boolean).slice(0, 15);
    const uniq = [], seen = new Set();
    for (const c of concepts) { const k = normalizeTextForMatch(c); if (!k || seen.has(k)) continue; seen.add(k); uniq.push(c); }
    conceptCache.set(key, uniq);
    return uniq;
  } catch { conceptCache.set(key, []); return []; }
}

export async function rankYouTubeCandidates(topicText, candidates, opts) {
  const topic = String(topicText || "").trim();
  const list = Array.isArray(candidates) ? candidates : [];
  if (!topic || !list.length) return [];
  const concepts = Array.isArray(opts?.concepts) ? opts.concepts : [];
  const topicVec = await embedText(topic);
  const scored = [];
  for (const c of list) {
    const title = String(c?.title || ""), description = String(c?.description || "");
    const durationSeconds = typeof c?.durationSeconds === "number" ? c.durationSeconds : null;
    const transcriptText = String(c?.transcriptText || "").trim();
    const bodyText = transcriptText || description;
    const videoText = clipText(`${title}\n${bodyText}`.trim(), 6000);
    const v = await embedText(videoText);
    const sim = topicVec.length && v.length ? cosineSimilarity(topicVec, v) : 0;
    let conceptCoverage = 0.5;
    if (concepts.length) { const cov = await computeConceptCoverage(concepts, bodyText); conceptCoverage = typeof cov?.ratio === "number" ? cov.ratio : 0.5; }
    const signals = transcriptSignalScore(bodyText);
    const dur = durationFitScore(durationSeconds);
    const quality = 0.45 * signals.coverage + 0.25 * signals.clarity + 0.2 * signals.examples + 0.1 * signals.structure;
    const score = 0.55 * sim + 0.25 * conceptCoverage + 0.15 * quality + 0.05 * dur;
    scored.push({ ...c, title, description, channelTitle: String(c?.channelTitle || ""), durationSeconds, transcriptText, conceptCoverage, _score: score });
  }
  scored.sort((a, b) => (b._score || 0) - (a._score || 0));
  return scored;
}

// ── JSON parsing ──────────────────────────────────────────────────────────────
export function stripJson(text) {
  const raw = String(text || "").trim();
  let fenced = raw;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match && match[1]) {
    fenced = match[1].trim();
  } else {
    fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const extractFirstJson = (input) => {
    const s = String(input || ""), start = s.search(/[\[{]/);
    if (start === -1) return null;
    const stack = []; let inString = false, escaped = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inString) { if (escaped) { escaped = false; continue; } if (ch === "\\") { escaped = true; continue; } if (ch === '"') inString = false; continue; }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") { const last = stack[stack.length - 1]; if ((ch === "}" && last === "{") || (ch === "]" && last === "[")) stack.pop(); }
      if (stack.length === 0 && i > start) return s.slice(start, i + 1);
    }
    return null;
  };
  try { return JSON.parse(fenced); } catch { /* continue */ }
  const firstJson = extractFirstJson(fenced);
  if (firstJson) try { return JSON.parse(firstJson); } catch { /* continue */ }
  const firstArr = fenced.indexOf("["), lastArr = fenced.lastIndexOf("]");
  if (firstArr !== -1 && lastArr > firstArr) try { return JSON.parse(fenced.slice(firstArr, lastArr + 1)); } catch { /* continue */ }
  const firstObj = fenced.indexOf("{"), lastObj = fenced.lastIndexOf("}");
  if (firstObj !== -1 && lastObj > firstObj) try { return JSON.parse(fenced.slice(firstObj, lastObj + 1)); } catch { /* continue */ }
  throw new Error("Failed to parse JSON response");
}

// ── Ollama (local) caller ─────────────────────────────────────────────────────
function getOllamaUrl() { return env("OLLAMA_URL", "http://127.0.0.1:11434"); }
function getOllamaModel() { return env("OLLAMA_MODEL", "llama3.2"); }

async function callOllama(messages, opts = {}) {
  const temperature = typeof opts.temperature === "number" ? opts.temperature : 0.2;
  const wantJson = opts.response_format === "json_object";
  const numPredict = typeof opts.num_predict === "number" ? opts.num_predict : 4096;
  const timeoutMs = typeof opts.timeout === "number" ? opts.timeout : 120000;
  const payload = JSON.stringify({
    model: getOllamaModel(),
    messages,
    stream: false,
    options: { temperature, num_predict: numPredict },
    ...(wantJson ? { format: "json" } : {})
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { throw new Error(text || "Ollama request failed"); }
    if (!res.ok) throw new Error(data?.error || "Ollama request failed");
    const content = data?.message?.content;
    if (!content) throw new Error("Ollama response missing content");
    return content;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error(`Ollama timed out after ${timeoutMs}ms`);
    throw err;
  }
}

// ── Remote LLM caller (OpenRouter only) ─────────────────────────────────────
async function callRemoteLLM(messages, opts = {}) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const model = String(opts.model || getOpenRouterModel());
  const temperature = typeof opts.temperature === "number" ? opts.temperature : 0.2;
  const envMax = Number(process.env.OPENROUTER_MAX_TOKENS);
  const max_tokens = typeof opts.max_tokens === "number" ? opts.max_tokens : (Number.isFinite(envMax) && envMax > 0 ? envMax : 8192);
  const payload = JSON.stringify({ model, temperature, max_tokens, messages });

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": getFrontendUrl(), "X-Title": "SmartLearn" },
        body: payload
      });
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { throw new Error(text || "OpenRouter request failed"); }
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || JSON.stringify(data);
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES - 1) {
          process.stderr.write(`[LLM] OpenRouter attempt ${attempt + 1} failed (${res.status}), retrying in ${(attempt + 1) * 2}s...\n`);
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          continue;
        }
        const err = new Error(msg); err.status = res.status; throw err;
      }
      const content = data?.choices?.[0]?.message?.content;
      if (data?.choices?.[0]?.finish_reason === "length") throw new Error("Model output truncated (increase max_tokens)");
      if (!content) throw new Error("OpenRouter response missing content");
      return content;
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        process.stderr.write(`[LLM] OpenRouter attempt ${attempt + 1} error: ${e?.message || e}, retrying...\n`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      throw e;
    }
  }
}

// ── Main LLM caller: OpenRouter first (3 retries), Ollama local fallback ────
export async function callOpenRouter(messages, opts = {}) {
  const userMsg = messages?.find(m => m.role === "user")?.content || "";
  const preview = userMsg.slice(0, 80).replace(/\n/g, " ");
  const start = Date.now();

  // Try OpenRouter first (3 retries built into callRemoteLLM)
  try {
    process.stdout.write(`\x1b[35m[LLM] OpenRouter (${getOpenRouterModel()}) ← "${preview}..."\x1b[0m\n`);
    const result = await callRemoteLLM(messages, opts);
    process.stdout.write(`\x1b[32m[LLM] OpenRouter ✓ (${Date.now() - start}ms, ${result.length} chars)\x1b[0m\n`);
    return result;
  } catch (remoteErr) {
    process.stderr.write(`\x1b[33m[LLM] OpenRouter failed (${remoteErr?.message || remoteErr}), falling back to Ollama...\x1b[0m\n`);
  }
  // Fallback to local Ollama
  try {
    process.stdout.write(`\x1b[35m[LLM] Ollama (${getOllamaModel()}) ← "${preview}..."\x1b[0m\n`);
    const result = await callOllama(messages, opts);
    process.stdout.write(`\x1b[32m[LLM] Ollama ✓ (${Date.now() - start}ms, ${result.length} chars)\x1b[0m\n`);
    return result;
  } catch (ollamaErr) {
    process.stderr.write(`\x1b[31m[LLM] Both OpenRouter & Ollama failed! Ollama: ${ollamaErr?.message}\x1b[0m\n`);
    throw ollamaErr;
  }
}
