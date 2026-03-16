import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import {
  callOpenRouter, stripJson, clipText, parseYouTubeSearchQuery,
  youtubeSearch, youtubeVideoDetails, fetchTranscriptText,
  extractSubConcepts, rankYouTubeCandidates, youtubeApiKey
} from "../utils/ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Video cache (file-based, same as before) ──────────────────────────────────
const learningVideosFilePath = path.resolve(__dirname, "..", "learning_videos.json");
let learningVideosStore = [];

export async function loadLearningVideosStore() {
  try { const raw = await fs.readFile(learningVideosFilePath, "utf8"); learningVideosStore = JSON.parse(raw) || []; } catch { learningVideosStore = []; }
}

async function saveLearningVideosStore() {
  await fs.writeFile(learningVideosFilePath, JSON.stringify(learningVideosStore, null, 2), "utf8");
}

function normalizeKeyPart(v) { return String(v || "").trim(); }

function findStoredVideos({ userId, subject, topic, version }) {
  const uid = normalizeKeyPart(userId) || "default", s = normalizeKeyPart(subject), t = normalizeKeyPart(topic), v = Number(version) || 1;
  if (!s || !t) return null;
  return learningVideosStore.find(r => String(r?.user_id || "") === uid && String(r?.subject || "") === s && String(r?.topic || "") === t && Number(r?.version || 1) === v) || null;
}

async function upsertStoredVideos({ userId, subject, topic, version, videos }) {
  const uid = normalizeKeyPart(userId) || "default", s = normalizeKeyPart(subject), t = normalizeKeyPart(topic), v = Number(version) || 1;
  if (!s || !t) return;
  const idx = learningVideosStore.findIndex(r => String(r?.user_id || "") === uid && String(r?.subject || "") === s && String(r?.topic || "") === t && Number(r?.version || 1) === v);
  const record = { id: idx >= 0 ? learningVideosStore[idx]?.id : Date.now(), user_id: uid, subject: s, topic: t, version: v, videos: Array.isArray(videos) ? videos : [], created_at: idx >= 0 ? learningVideosStore[idx]?.created_at : new Date().toISOString() };
  if (idx >= 0) learningVideosStore[idx] = record; else learningVideosStore.push(record);
  await saveLearningVideosStore();
}

const router = Router();

// ── Regenerate single resource ────────────────────────────────────────────────
router.post("/api/ai/resource", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const subtopicTitle = String(req.body?.subtopicTitle || "").trim();
    const resourceType = String(req.body?.resourceType || "").trim();
    const index = Number.isFinite(Number(req.body?.index)) ? Number(req.body.index) : null;
    const current = req.body?.current;
    const cognitiveLoad = String(req.body?.cognitiveLoad || "OPTIMAL_LOAD").trim();
    const extraContext = String(req.body?.extraContext || "").trim();

    if (!subject) return res.status(400).json({ error: "Missing subject" });
    if (!subtopicTitle) return res.status(400).json({ error: "Missing subtopicTitle" });
    if (!resourceType) return res.status(400).json({ error: "Missing resourceType" });

    const adapt = cognitiveLoad === "HIGH_LOAD" ? "DETECTED: HIGH COGNITIVE LOAD. Simplify heavily. Use short sentences. Use 1 analogy max. Provide step-by-step."
      : cognitiveLoad === "LOW_LOAD" ? "DETECTED: LOW COGNITIVE LOAD. Increase depth and rigor. Add one challenging extension." : "";

    const prompts = {
      notes: { schema: '{"notes": string}', prompt: `Regenerate ONLY the NOTES for topic: "${subtopicTitle}" in subject "${subject}".\n\n${adapt}\nExisting: ${typeof current === "string" ? clipText(current, 1200) : ""}\nExtra: ${extraContext}\nReturn ONLY valid JSON {"notes": string}. Plain text only.` },
      notes_snippet: { schema: '{"snippet": string}', prompt: `Rewrite this NOTES SNIPPET to be more understandable.\nTOPIC: "${subtopicTitle}" in "${subject}"\n${adapt}\nSNIPPET: ${clipText(String(current?.snippet || current || ""), 1800)}\nExtra: ${extraContext}\nReturn ONLY valid JSON {"snippet": string}.` },
      video_item: { schema: '{"title","url","description"}', prompt: `Suggest ONE alternative YouTube video for: "${subtopicTitle}" in "${subject}".\n${adapt}\nCurrent: ${clipText(String(current?.title || ""), 200)}\nExtra: ${extraContext}\nReturn JSON {"title": string, "url": string, "description": string}. URL must be https://www.youtube.com/...` },
      practice_question: { schema: '{"question","answer"}', prompt: `Regenerate ONE PRACTICE QUESTION for: "${subtopicTitle}" in "${subject}".\n${adapt}\nExisting Q: ${clipText(String(current?.question || ""), 600)}\nExtra: ${extraContext}\nReturn JSON {"question": string, "answer": string}. Answer must include OBJECTIVE:, LOGIC:, FINAL ANSWER:.` },
      solved_example: { schema: '{"problem","solution","steps"}', prompt: `Regenerate ONE SOLVED EXAMPLE for: "${subtopicTitle}" in "${subject}".\n${adapt}\nExisting: ${clipText(String(current?.problem || ""), 600)}\nExtra: ${extraContext}\nReturn JSON {"problem": string, "solution": string, "steps": string[]}.` },
      quiz_item: { schema: '{"question","options","answer","explanation"}', prompt: `Regenerate ONE QUIZ ITEM for: "${subtopicTitle}" in "${subject}".\n${adapt}\nExisting Q: ${clipText(String(current?.question || ""), 600)}\nIndex: ${index}\nExtra: ${extraContext}\nReturn JSON {"question": string, "options": string[4], "answer": string, "explanation": string}.` },
      flashcard: { schema: '{"front","back"}', prompt: `Regenerate ONE FLASHCARD for: "${subtopicTitle}" in "${subject}".\n${adapt}\nExisting: ${clipText(String(current?.front || ""), 400)}\nExtra: ${extraContext}\nReturn JSON {"front": string, "back": string}.` }
    };

    if (!prompts[resourceType]) return res.status(400).json({ error: "Unsupported resourceType" });

    const content = await callOpenRouter(
      [{ role: "system", content: "You generate strictly valid JSON and nothing else." }, { role: "user", content: prompts[resourceType].prompt }],
      { response_format: "json_object", max_tokens: 8192, temperature: 0.2 }
    );
    const parsed = stripJson(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return res.status(500).json({ error: "Resource response was not a JSON object" });
    return res.json({ ok: true, resource: parsed });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Generate roadmap ──────────────────────────────────────────────────────────
router.post("/api/ai/roadmap", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const timeframe = String(req.body?.timeframe || "").trim();
    const syllabus = String(req.body?.syllabus || "").trim();
    const difficultyLevel = String(req.body?.difficultyLevel || "").trim();
    const learningStyle = String(req.body?.learningStyle || "").trim();
    const dailyHours = Number(req.body?.dailyHours) || 0;
    const referenceTextbook = String(req.body?.referenceTextbook || "").trim();
    if (!subject) return res.status(400).json({ error: "Missing subject" });
    if (!timeframe) return res.status(400).json({ error: "Missing timeframe" });

    const extras = [];
    if (difficultyLevel) extras.push(`Difficulty Level: ${difficultyLevel}.`);
    if (learningStyle) extras.push(`Learning Style: ${learningStyle}-focused content.`);
    if (dailyHours > 0) extras.push(`Daily Study Hours: ${dailyHours} hours per day.`);
    if (referenceTextbook) extras.push(`Reference Textbook: "${referenceTextbook}".`);
    const extraBlock = extras.length ? `\n\nADDITIONAL PREFERENCES:\n${extras.join("\n")}` : "";

    const prompt = `Act as an Academic expert. Create a ${difficultyLevel || "beginner-friendly"}, DAY-BY-DAY study plan for: "${subject}".\nTotal Duration: ${timeframe}.\nDetails: ${syllabus || "Standard mastery path"}.${extraBlock}\n\nSTRICT PLAN RULES:\n1. CONSECUTIVE DAYS: Provide lessons for EVERY SINGLE DAY. No gaps.\n2. PROGRESSION: Follow a 4-stage flow: Foundations, Core Concepts, Practice, Mastery.\n3. BREAKDOWN: Break large subjects into smaller focused daily lessons.\n4. CLEAR GOALS: Give each lesson 2-3 specific achievable daily_goals.\n\nLENGTH LIMITS:\n- Module descriptions <= 18 words.\n- Subtopic titles <= 8 words.\n- daily_goals: exactly 2 short strings (<= 8 words each).\n\nOUTPUT: Return ONLY valid JSON with key "roadmap" as array of modules.\nEach module: {"id": string, "title": string, "description": string, "subtopics": [{"id": string, "title": string, "day_number": number, "daily_goals": string[], "difficulty": "easy"|"medium"|"advanced"}]}`;

    const content = await callOpenRouter(
      [{ role: "system", content: "You generate strictly valid JSON and nothing else." }, { role: "user", content: prompt }],
      { response_format: "json_object", max_tokens: 8192, temperature: 0.1 }
    );
    const parsed = stripJson(content);
    const roadmap = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.roadmap) ? parsed.roadmap : null;
    if (!roadmap) return res.status(500).json({ error: "Roadmap response was not valid JSON" });
    return res.json({ ok: true, roadmap });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Generate full content bundle ──────────────────────────────────────────────
router.post("/api/ai/content", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const subtopicTitle = String(req.body?.subtopicTitle || "").trim();
    const cognitiveLoad = String(req.body?.cognitiveLoad || "OPTIMAL_LOAD").trim();
    const userId = String(req.body?.userId || req.body?.uid || "").trim() || "default";
    const version = 1;
    if (!subject) return res.status(400).json({ error: "Missing subject" });
    if (!subtopicTitle) return res.status(400).json({ error: "Missing subtopicTitle" });

    const existing = findStoredVideos({ userId, subject, topic: subtopicTitle, version });
    const adapt = cognitiveLoad === "HIGH_LOAD" ? "DETECTED: HIGH COGNITIVE LOAD. Use simple analogies. Break content into small steps."
      : cognitiveLoad === "LOW_LOAD" ? "DETECTED: LOW COGNITIVE LOAD. Increase technical depth." : "";

    const prompt = `Generate a comprehensive academic learning bundle for: "${subtopicTitle}" in "${subject}".\n\n${adapt}\n\nReturn ONLY valid JSON with keys: notes (string 700+ words), videos (3 items), materials (3 items), solved_examples (3), practice_questions (5), quiz (10 MCQs), flashcards (10).\n- videos: {"title","url","description"} using https://www.youtube.com/results?search_query=...\n- materials: {"title","url","type","description"} using https://scholar.google.com/scholar?q=...\n- solved_examples: {"problem","solution","steps"}\n- practice_questions: {"question","answer"}\n- quiz: {"question","options","answer","explanation"}\n- flashcards: {"front","back"}`;

    const content = await callOpenRouter(
      [{ role: "system", content: "You generate strictly valid JSON and nothing else." }, { role: "user", content: prompt }],
      { response_format: "json_object", max_tokens: 8192 }
    );
    const parsed = stripJson(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return res.status(500).json({ error: "Bundle response was not a JSON object" });

    if (existing?.videos?.length) { parsed.videos = existing.videos; return res.json({ ok: true, bundle: parsed, citations: [] }); }

    try {
      if (youtubeApiKey && Array.isArray(parsed?.videos) && parsed.videos.length) {
        const seedQueries = parsed.videos.map(v => parseYouTubeSearchQuery(v?.url)).filter(Boolean);
        const candidates = [];
        for (const q of seedQueries.slice(0, 3)) candidates.push(...(await youtubeSearch(q, 6)));
        const uniq = new Map();
        for (const c of candidates) { const id = String(c?.videoId || "").trim(); if (id && !uniq.has(id)) uniq.set(id, c); }
        const uniqList = Array.from(uniq.values());
        const detailsMap = await youtubeVideoDetails(uniqList.map(c => c.videoId));
        const enriched = uniqList.map(c => ({ ...c, durationSeconds: detailsMap.get(c.videoId)?.durationSeconds ?? null }));
        const topicText = `${subject}: ${subtopicTitle}`;
        const concepts = await extractSubConcepts(subject, subtopicTitle);
        const prelimRanked = await rankYouTubeCandidates(topicText, enriched, { concepts });
        const transcriptTargets = prelimRanked.slice(0, Math.min(8, prelimRanked.length));
        const transcriptById = new Map();
        for (const v of transcriptTargets) { const id = String(v?.videoId || "").trim(); if (id) transcriptById.set(id, await fetchTranscriptText(id)); }
        const enrichedWithTranscripts = enriched.map(v => ({ ...v, transcriptText: transcriptById.get(String(v?.videoId || "").trim()) || "" }));
        const ranked = await rankYouTubeCandidates(topicText, enrichedWithTranscripts, { concepts });
        const top = ranked.slice(0, 3);
        if (top.length) {
          parsed.videos = top.map(v => ({ title: v.title, url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`, description: v.transcriptText ? clipText(v.transcriptText, 500) : v.description }));
          await upsertStoredVideos({ userId, subject, topic: subtopicTitle, version, videos: parsed.videos });
        }
      }
    } catch (e) { process.stderr.write(`YouTube ranking failed: ${e?.message || e}\n`); }

    return res.json({ ok: true, bundle: parsed, citations: [] });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Tutor chat ────────────────────────────────────────────────────────────────
router.post("/api/tutor/chat", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const subtopicTitle = String(req.body?.subtopicTitle || "").trim();
    const context = String(req.body?.context || "").trim();
    const question = String(req.body?.question || "").trim();
    if (!subject) return res.status(400).json({ ok: false, error: "Missing subject" });
    if (!question) return res.status(400).json({ ok: false, error: "Missing question" });
    const clippedContext = context ? clipText(context, 8000) : "";
    const messages = [
      { role: "system", content: "You are a friendly academic tutor. Stay within the subject area. Give complete but easy-to-read explanations with examples. Use conversational tone and short paragraphs." },
      { role: "user", content: `SUBJECT: ${subject}\n${subtopicTitle ? `TOPIC: ${subtopicTitle}\n` : ""}${clippedContext ? `\nSTUDY MATERIAL:\n${clippedContext}\n` : ""}\nQUESTION:\n${question}` }
    ];
    const content = await callOpenRouter(messages, { temperature: 0.25 });
    return res.json({ ok: true, reply: typeof content === "string" ? content : JSON.stringify(content) });
  } catch (err) { return res.status(500).json({ ok: false, error: err?.message || "Failed" }); }
});

export default router;
