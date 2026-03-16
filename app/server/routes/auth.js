import { Router } from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models.js";

const router = Router();

const otpSecret = process.env.OTP_SECRET;
const emailUser = process.env.OTP_EMAIL_USER;
const rawEmailPass = process.env.OTP_EMAIL_APP_PASSWORD;
const emailPass = rawEmailPass ? String(rawEmailPass).replace(/\s+/g, "") : rawEmailPass;

const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: emailUser, pass: emailPass } });
try { transporter.verify().then(() => process.stdout.write("Email transporter verified\n"), (err) => process.stderr.write(`Email transporter verify failed: ${err?.message || err}\n`)); } catch {}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const otpStore = new Map();

function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function generateOtp() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"); }
function hashOtp(otp) { if (!otpSecret) throw new Error("OTP_SECRET is not set"); return crypto.createHmac("sha256", otpSecret).update(String(otp)).digest("hex"); }
function storeKey(purpose, email) { return `${purpose}:${email}`; }

// ── OTP ───────────────────────────────────────────────────────────────────────
router.post("/api/otp/send", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const purpose = String(req.body?.purpose || "");
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (purpose !== "register" && purpose !== "reset") return res.status(400).json({ error: "Invalid purpose" });
    if (!otpSecret) return res.status(500).json({ error: "OTP_SECRET is not configured" });
    if (!emailUser || !emailPass) return res.status(500).json({ error: "Email sender is not configured" });
    const otp = generateOtp();
    const key = storeKey(purpose, email);
    otpStore.set(key, { hash: hashOtp(otp), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    const subject = purpose === "register" ? "Your SmartLearn verification code" : "Your SmartLearn password reset code";
    await transporter.sendMail({ from: `SmartLearn <${emailUser}>`, to: email, subject, text: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.` });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed to send OTP" }); }
});

router.post("/api/otp/verify", (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const purpose = String(req.body?.purpose || "");
    const otp = String(req.body?.otp || "").trim();
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (purpose !== "register" && purpose !== "reset") return res.status(400).json({ error: "Invalid purpose" });
    if (!otp || otp.length !== 6) return res.status(400).json({ error: "Invalid OTP" });
    const key = storeKey(purpose, email);
    const record = otpStore.get(key);
    if (!record) return res.status(400).json({ error: "No active OTP" });
    if (Date.now() > record.expiresAt) { otpStore.delete(key); return res.status(400).json({ error: "OTP expired" }); }
    if (record.attempts >= MAX_ATTEMPTS) { otpStore.delete(key); return res.status(429).json({ error: "Too many attempts" }); }
    record.attempts += 1;
    if (hashOtp(otp) !== record.hash) { otpStore.set(key, record); return res.status(400).json({ error: "Invalid OTP" }); }
    otpStore.delete(key);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Failed to verify OTP" }); }
});

// ── Google Auth ───────────────────────────────────────────────────────────────
router.post("/api/auth/google", async (req, res) => {
  try {
    const credential = String(req.body?.credential || "");
    if (!credential) return res.status(400).json({ error: "Missing credential" });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not set" });
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    const name = payload?.name || payload?.given_name;
    if (!email) return res.status(400).json({ error: "Google token missing email" });
    let user = await User.findOne({ email });
    if (!user) user = await User.create({ uid: crypto.randomBytes(12).toString("hex"), name: name || email.split("@")[0], email, created_at: new Date() });
    return res.json({ ok: true, profile: { uid: user.uid, email: user.email, name: user.name } });
  } catch { return res.status(401).json({ error: "Invalid Google credential" }); }
});

router.post("/api/auth/login-google", async (req, res) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const name = String(req.body?.name || "");
    if (!email) return res.status(400).json({ error: "email required" });
    let user = await User.findOne({ email });
    if (!user) user = await User.create({ uid: crypto.randomBytes(12).toString("hex"), name: name || email.split("@")[0], email, created_at: new Date() });
    return res.json({ ok: true, user: { uid: user.uid, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) { return res.status(500).json({ error: err?.message || "Failed" }); }
});

// ── Register / Login ──────────────────────────────────────────────────────────
router.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });
    const emailKey = String(email).toLowerCase().trim();
    if (await User.findOne({ email: emailKey })) return res.status(409).json({ error: "Email already registered" });
    const hashed = await bcrypt.hash(String(password), 12);
    const user = await User.create({ uid: crypto.randomBytes(12).toString("hex"), name: String(name).trim(), email: emailKey, password: hashed, created_at: new Date() });
    return res.json({ ok: true, user: { uid: user.uid, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) { return res.status(500).json({ error: err?.message || "Registration failed" }); }
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !user.password) return res.status(401).json({ error: "Invalid email or password" });
    const match = await bcrypt.compare(String(password), user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });
    return res.json({ ok: true, user: { uid: user.uid, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) { return res.status(500).json({ error: err?.message || "Login failed" }); }
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.put("/api/auth/user/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const updates = {};
    if (req.body?.name) updates.name = String(req.body.name).trim();
    const user = await User.findOneAndUpdate({ uid }, updates, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ ok: true, user: { uid: user.uid, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) { return res.status(500).json({ error: err?.message || "Update failed" }); }
});

router.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) return res.status(400).json({ error: "email and newPassword are required" });
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "User not found" });
    user.password = await bcrypt.hash(String(newPassword), 12);
    await user.save();
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Reset failed" }); }
});

export default router;
