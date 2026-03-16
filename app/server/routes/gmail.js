import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = Number(process.env.API_PORT || 5171);
const GMAIL_OAUTH_REDIRECT_URI = process.env.GMAIL_OAUTH_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/gmail/oauth/callback`;
const gmailClientId = process.env.GOOGLE_CLIENT_ID;
const gmailClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const gmailTokenFilePath = path.resolve(__dirname, "..", "gmail_tokens.json");
let gmailTokenStore = {};

export async function loadGmailTokenStore() {
  try { const raw = await fs.readFile(gmailTokenFilePath, "utf8"); const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") gmailTokenStore = parsed; } catch { gmailTokenStore = {}; }
}

async function saveGmailTokenStore() {
  await fs.writeFile(gmailTokenFilePath, JSON.stringify(gmailTokenStore, null, 2), "utf8");
}

function getOAuth2Client() {
  if (!gmailClientId || !gmailClientSecret) throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set");
  return new google.auth.OAuth2(gmailClientId, gmailClientSecret, GMAIL_OAUTH_REDIRECT_URI);
}

function getUserKey(req) { return String(req.query?.uid || req.body?.uid || "").trim(); }

function decodeBase64Url(data) {
  if (!data) return "";
  const b64 = String(data).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  return Buffer.from(pad ? b64 + "=".repeat(4 - pad) : b64, "base64").toString("utf8");
}

function extractPlainTextFromPayload(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const p of (Array.isArray(payload.parts) ? payload.parts : [])) { const txt = extractPlainTextFromPayload(p); if (txt) return txt; }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

const router = Router();

router.get("/api/gmail/status", async (req, res) => {
  try {
    const uid = getUserKey(req);
    if (!uid) return res.status(400).json({ error: "Missing uid" });
    const record = gmailTokenStore[uid];
    return res.json({ ok: true, connected: Boolean(record?.tokens?.refresh_token || record?.tokens?.access_token), lastSyncAt: record?.lastSyncAt || null });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.get("/api/gmail/oauth/url", async (req, res) => {
  try {
    const uid = getUserKey(req);
    if (!uid) return res.status(400).json({ error: "Missing uid" });
    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["https://www.googleapis.com/auth/gmail.readonly"], state: uid });
    return res.json({ ok: true, url });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.get("/api/gmail/oauth/callback", async (req, res) => {
  try {
    const code = String(req.query?.code || ""), uid = String(req.query?.state || "");
    if (!uid) return res.status(400).send("Missing state");
    if (!code) return res.status(400).send("Missing code");
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    gmailTokenStore[uid] = { tokens, connectedAt: new Date().toISOString(), lastSyncAt: gmailTokenStore[uid]?.lastSyncAt, seenMessageIds: gmailTokenStore[uid]?.seenMessageIds || [] };
    await saveGmailTokenStore();
    return res.redirect(`${FRONTEND_URL}?gmail=connected`);
  } catch (err) { process.stderr.write(`Gmail OAuth callback failed: ${err?.message || err}\n`); return res.redirect(`${FRONTEND_URL}?gmail=error`); }
});

router.post("/api/gmail/disconnect", async (req, res) => {
  try {
    const uid = getUserKey(req);
    if (!uid) return res.status(400).json({ error: "Missing uid" });
    delete gmailTokenStore[uid];
    await saveGmailTokenStore();
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.get("/api/gmail/messages", async (req, res) => {
  try {
    const uid = getUserKey(req);
    if (!uid) return res.status(400).json({ error: "Missing uid" });
    const record = gmailTokenStore[uid];
    if (!record?.tokens) return res.status(401).json({ error: "Gmail not connected" });
    const q = String(req.query?.q || process.env.GMAIL_TASK_QUERY || "newer_than:14d");
    const maxResults = Math.min(50, Math.max(1, Number(req.query?.max || 10)));
    const pageToken = req.query?.pageToken ? String(req.query.pageToken) : undefined;
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(record.tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const list = await gmail.users.messages.list({ userId: "me", q, maxResults, pageToken });
    const force = String(req.query?.force || "").trim() === "1";
    const seen = new Set(Array.isArray(record.seenMessageIds) ? record.seenMessageIds : []);
    const ids = (list.data.messages || []).map(m => m.id).filter(Boolean);
    const newIds = force ? ids : ids.filter(id => !seen.has(id));
    const messages = [];
    for (const id of newIds) {
      const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const headers = msg.data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "";
      const from = headers.find(h => h.name?.toLowerCase() === "from")?.value || "";
      const date = headers.find(h => h.name?.toLowerCase() === "date")?.value || "";
      let bodyText = extractPlainTextFromPayload(msg.data.payload);
      if (bodyText?.length > 8000) bodyText = bodyText.slice(0, 8000);
      messages.push({ id, threadId: msg.data.threadId, internalDate: msg.data.internalDate, snippet: msg.data.snippet, subject, from, date, body: bodyText });
      seen.add(id);
    }
    gmailTokenStore[uid] = { ...record, tokens: oauth2Client.credentials, lastSyncAt: new Date().toISOString(), seenMessageIds: Array.from(seen).slice(-500) };
    await saveGmailTokenStore();
    return res.json({ ok: true, q, messages, nextPageToken: list.data.nextPageToken || null, meta: { listed: ids.length, returned: messages.length, forced: force } });
  } catch (err) { process.stderr.write(`Gmail messages fetch failed: ${err?.message || err}\n`); return res.status(500).json({ error: err?.message || "Failed" }); }
});

export default router;
