import { Router } from "express";
import { Agent, TaskDoc, Schedule, Analytics } from "../models.js";

const router = Router();

// ── Agents ────────────────────────────────────────────────────────────────────
router.get("/api/data/agents", async (req, res) => {
  try {
    const uid = String(req.query.uid || "");
    if (!uid) return res.status(400).json({ error: "uid required" });
    const docs = await Agent.find({ user_id: uid });
    return res.json({ ok: true, agents: docs.map(d => d.data) });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.post("/api/data/agent", async (req, res) => {
  try {
    const agent = req.body?.agent;
    if (!agent?.id || !agent?.user_id) return res.status(400).json({ error: "agent.id and agent.user_id required" });
    await Agent.findOneAndUpdate({ id: agent.id }, { id: agent.id, user_id: agent.user_id, data: agent }, { upsert: true, new: true });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.delete("/api/data/agent/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Agent.deleteOne({ id });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get("/api/data/tasks", async (req, res) => {
  try {
    const uid = String(req.query.uid || "");
    if (!uid) return res.status(400).json({ error: "uid required" });
    const doc = await TaskDoc.findOne({ user_id: uid });
    return res.json({ ok: true, tasks: doc?.tasks || [] });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.post("/api/data/tasks", async (req, res) => {
  try {
    const { uid, tasks } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid required" });
    await TaskDoc.findOneAndUpdate({ user_id: uid }, { user_id: uid, tasks: tasks || [] }, { upsert: true, new: true });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Schedule ──────────────────────────────────────────────────────────────────
router.get("/api/data/schedule", async (req, res) => {
  try {
    const uid = String(req.query.uid || "");
    if (!uid) return res.status(400).json({ error: "uid required" });
    const doc = await Schedule.findOne({ user_id: uid });
    return res.json({ ok: true, schedule: doc?.schedule || [] });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.post("/api/data/schedule", async (req, res) => {
  try {
    const { uid, schedule } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid required" });
    await Schedule.findOneAndUpdate({ user_id: uid }, { user_id: uid, schedule: schedule || [] }, { upsert: true, new: true });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Analytics ─────────────────────────────────────────────────────────────────
router.post("/api/data/analytics", async (req, res) => {
  try {
    const { user_id, agent_id, event_type, data } = req.body || {};
    if (!user_id || !agent_id) return res.status(400).json({ error: "user_id and agent_id required" });
    await Analytics.create({ user_id, agent_id, event_type: event_type || "session", data: data || {} });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

router.get("/api/data/analytics", async (req, res) => {
  try {
    const uid = String(req.query.uid || "");
    const agentId = String(req.query.agent_id || "");
    if (!uid) return res.status(400).json({ error: "uid required" });
    const query = { user_id: uid };
    if (agentId) query.agent_id = agentId;
    const docs = await Analytics.find(query).sort({ timestamp: -1 }).limit(500);
    return res.json({ ok: true, analytics: docs });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

export default router;
