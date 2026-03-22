import { Router } from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models.js";

const router = Router();

// Lazy env reads — dotenv hasn't loaded yet when ES module top-level runs
function getOtpSecret() { return process.env.OTP_SECRET || ""; }
function getEmailUser() { return process.env.OTP_EMAIL_USER || ""; }
function getEmailPass() {
  const raw = process.env.OTP_EMAIL_APP_PASSWORD || "";
  return raw ? String(raw).replace(/\s+/g, "") : "";
}

// Create transporter lazily on first use
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    const user = getEmailUser();
    const pass = getEmailPass();
    _transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    _transporter.verify()
      .then(() => process.stdout.write("\x1b[32m[Email] Transporter verified ✓\x1b[0m\n"))
      .catch(err => process.stderr.write(`\x1b[33m[Email] Transporter verify failed: ${err?.message || err}\x1b[0m\n`));
  }
  return _transporter;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const otpStore = new Map();

function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function generateOtp() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"); }
function hashOtp(otp) { const secret = getOtpSecret(); if (!secret) throw new Error("OTP_SECRET is not set"); return crypto.createHmac("sha256", secret).update(String(otp)).digest("hex"); }
function storeKey(purpose, email) { return `${purpose}:${email}`; }

// ── OTP ───────────────────────────────────────────────────────────────────────
router.post("/api/otp/send", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const purpose = String(req.body?.purpose || "");
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (purpose !== "register" && purpose !== "reset") return res.status(400).json({ error: "Invalid purpose" });
    if (!getOtpSecret()) return res.status(500).json({ error: "OTP_SECRET is not configured" });
    if (!getEmailUser() || !getEmailPass()) return res.status(500).json({ error: "Email sender is not configured" });
    const otp = generateOtp();
    const key = storeKey(purpose, email);
    otpStore.set(key, { hash: hashOtp(otp), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    const subject = purpose === "register" ? "Your SmartLearn verification code" : "Your SmartLearn password reset code";
    await getTransporter().sendMail({ from: `SmartLearn <${getEmailUser()}>`, to: email, subject, text: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.` });
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
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error("[Google Auth] Token verification failed:", verifyErr?.message || verifyErr);
      return res.status(401).json({ error: "Invalid Google credential" });
    }
    const email = payload?.email?.toLowerCase().trim();
    const name = payload?.name || payload?.given_name;
    if (!email) return res.status(400).json({ error: "Google token missing email" });
    let user = await User.findOne({ email });
    if (!user) {
      try {
        user = await User.create({ uid: crypto.randomBytes(12).toString("hex"), name: name || email.split("@")[0], email, created_at: new Date() });
      } catch (dbErr) {
        console.error("[Google Auth] DB create error:", dbErr?.message || dbErr);
        // If duplicate email (race condition), just fetch again
        if (dbErr?.code === 11000) {
          user = await User.findOne({ email });
        }
        if (!user) return res.status(500).json({ error: dbErr?.message || "Failed to create user" });
      }
    }
    return res.json({ ok: true, profile: { uid: user.uid, email: user.email, name: user.name } });
  } catch (err) {
    console.error("[Google Auth] Unexpected error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Google auth failed" });
  }
});

router.post("/api/auth/login-google", async (req, res) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const name = String(req.body?.name || "");
    if (!email) return res.status(400).json({ error: "email required" });
    let user = await User.findOne({ email });
    if (!user) {
      try {
        user = await User.create({ uid: crypto.randomBytes(12).toString("hex"), name: name || email.split("@")[0], email, created_at: new Date() });
      } catch (dbErr) {
        console.error("[Login-Google] DB create error:", dbErr?.message || dbErr);
        if (dbErr?.code === 11000) {
          user = await User.findOne({ email });
        }
        if (!user) return res.status(500).json({ error: dbErr?.message || "Failed to create user" });
      }
    }
    return res.json({ ok: true, user: { uid: user.uid, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) {
    console.error("[Login-Google] Unexpected error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Failed" });
  }
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
