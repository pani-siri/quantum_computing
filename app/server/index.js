import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

// ── MongoDB ───────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smartlearn";
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected:", MONGO_URI))
  .catch(err => console.error("MongoDB connection error:", err));

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const PORT = Number(process.env.API_PORT || 5171);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const allowedOrigins = new Set([
  FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/debug/routes", (_req, res) => {
  try {
    const stack = app?._router?.stack || [];
    const routes = stack
      .filter(layer => layer?.route?.path)
      .map(layer => ({ path: layer.route.path, methods: Object.keys(layer.route.methods || {}).filter(m => layer.route.methods[m]) }));
    return res.json({ ok: true, routes });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Mount routes ──────────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.js";
import dataRoutes from "./routes/data.js";
import aiRoutes, { loadLearningVideosStore } from "./routes/ai.js";
import qsvmRoutes from "./routes/qsvm.js";
import gmailRoutes, { loadGmailTokenStore } from "./routes/gmail.js";

app.use(authRoutes);
app.use(dataRoutes);
app.use(aiRoutes);
app.use(qsvmRoutes);
app.use(gmailRoutes);

// ── Init stores & start ───────────────────────────────────────────────────────
Promise.all([
  loadGmailTokenStore().catch(err => process.stderr.write(`Gmail token store: ${err?.message}\n`)),
  loadLearningVideosStore().catch(err => process.stderr.write(`Video store: ${err?.message}\n`))
]).then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    process.stdout.write(`API listening on http://127.0.0.1:${PORT}\n`);
  });
});
