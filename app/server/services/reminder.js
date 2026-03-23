import nodemailer from "nodemailer";
import { User, Schedule, Agent } from "../models.js";

// Track sent reminders to avoid duplicates: Set<"userId:eventId:date">
const sentReminders = new Set();

// Clean old entries every hour (reminders older than 24h)
setInterval(() => sentReminders.clear(), 24 * 60 * 60 * 1000);

function getEmailUser() { return process.env.OTP_EMAIL_USER || ""; }
function getEmailPass() {
  const raw = process.env.OTP_EMAIL_APP_PASSWORD || "";
  return raw ? String(raw).replace(/\s+/g, "") : "";
}

let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    const user = getEmailUser();
    const pass = getEmailPass();
    if (!user || !pass) return null;
    _transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  }
  return _transporter;
}

// Reminder preferences stored in memory (per user_id)
// Persisted to MongoDB via a dedicated collection
const defaultPrefs = { enabled: true, minutesBefore: 30 };
const userPrefs = new Map();

export function getReminderPrefs(userId) {
  return userPrefs.get(userId) || { ...defaultPrefs };
}

export function setReminderPrefs(userId, prefs) {
  const current = getReminderPrefs(userId);
  const updated = { ...current, ...prefs };
  userPrefs.set(userId, updated);
  return updated;
}

async function sendReminderEmail(email, userName, event, agentSubject) {
  const transporter = getTransporter();
  if (!transporter) {
    process.stdout.write("\x1b[33m[Reminder] Email not configured, skipping\x1b[0m\n");
    return false;
  }

  const startTime = new Date(event.start_time);
  const timeStr = startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = startTime.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const topicName = event.title.replace(/^Study:\s*/, "");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: linear-gradient(135deg, #1583eb 0%, #084894 100%); border-radius: 20px; overflow: hidden;">
      <div style="padding: 40px 32px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px;">SmartLearn</h1>
        <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin: 0;">Study Reminder</p>
      </div>
      <div style="background: rgba(255,255,255,0.95); margin: 0 16px 16px; border-radius: 16px; padding: 32px;">
        <p style="color: #333; font-size: 16px; margin: 0 0 16px;">Hi <strong>${userName || "there"}</strong>,</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Your study session is coming up soon! Here are the details:
        </p>
        <div style="background: #f0f7ff; border-radius: 12px; padding: 20px; margin: 0 0 24px; border-left: 4px solid #1583eb;">
          <p style="color: #084894; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; margin: 0 0 8px;">
            ${agentSubject || "Study Session"}
          </p>
          <p style="color: #1a1a1a; font-size: 18px; font-weight: 700; margin: 0 0 12px;">
            ${topicName}
          </p>
          <p style="color: #666; font-size: 13px; margin: 0;">
            ${dateStr} at <strong>${timeStr}</strong>
          </p>
        </div>
        <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
          Keep up the great work on your learning journey!
        </p>
      </div>
      <div style="text-align: center; padding: 0 0 24px;">
        <p style="color: rgba(255,255,255,0.5); font-size: 11px; margin: 0;">
          SmartLearn Adaptive Learning Platform
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `SmartLearn <${getEmailUser()}>`,
      to: email,
      subject: `Study Reminder: ${topicName} — ${timeStr}`,
      html
    });
    return true;
  } catch (err) {
    process.stderr.write(`\x1b[31m[Reminder] Email send failed: ${err?.message}\x1b[0m\n`);
    return false;
  }
}

async function checkAndSendReminders() {
  try {
    const now = Date.now();
    const schedules = await Schedule.find({});

    for (const doc of schedules) {
      const userId = doc.user_id;
      const prefs = getReminderPrefs(userId);
      if (!prefs.enabled) continue;

      const events = doc.schedule || [];
      const windowMs = prefs.minutesBefore * 60 * 1000;

      for (const event of events) {
        if (event.type !== "study") continue;

        const startTime = new Date(event.start_time).getTime();
        const timeDiff = startTime - now;

        // Send reminder if event is within the window and hasn't started yet
        if (timeDiff > 0 && timeDiff <= windowMs) {
          const dateKey = new Date(event.start_time).toISOString().slice(0, 10);
          const reminderKey = `${userId}:${event.id}:${dateKey}`;

          if (sentReminders.has(reminderKey)) continue;

          // Check if subtopic is already completed
          if (event.agent_id && event.subtopic_id) {
            const agentDoc = await Agent.findOne({ id: event.agent_id });
            if (agentDoc?.data?.roadmap) {
              const sub = agentDoc.data.roadmap
                .flatMap(m => m.subtopics || [])
                .find(s => s.id === event.subtopic_id);
              if (sub?.is_completed) {
                sentReminders.add(reminderKey);
                continue; // skip completed subtopics
              }
            }
          }

          // Get user email
          const user = await User.findOne({ uid: userId });
          if (!user?.email) continue;

          // Get agent subject name
          let agentSubject = "";
          if (event.agent_id) {
            const agentDoc = await Agent.findOne({ id: event.agent_id });
            agentSubject = agentDoc?.data?.subject || "";
          }

          const sent = await sendReminderEmail(user.email, user.name, event, agentSubject);
          if (sent) {
            sentReminders.add(reminderKey);
            process.stdout.write(
              `\x1b[35m[Reminder] ✉ Sent to ${user.email}: "${event.title}" at ${new Date(event.start_time).toLocaleTimeString()}\x1b[0m\n`
            );
          }
        }
      }
    }
  } catch (err) {
    process.stderr.write(`\x1b[31m[Reminder] Check failed: ${err?.message}\x1b[0m\n`);
  }
}

let reminderInterval = null;

export function startReminderService() {
  if (reminderInterval) return;

  const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
  process.stdout.write("\x1b[35m[Reminder] Service started — checking every 5 minutes\x1b[0m\n");

  // Initial check after 30 seconds (let DB connect first)
  setTimeout(() => checkAndSendReminders(), 30 * 1000);

  reminderInterval = setInterval(checkAndSendReminders, CHECK_INTERVAL);
}

export function stopReminderService() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

// Send a test reminder to a specific email
export async function sendTestReminder(email, userName) {
  const fakeEvent = {
    title: "Study: Test Reminder - Quantum Computing Basics",
    start_time: new Date(Date.now() + 30 * 60000).toISOString(),
  };
  return sendReminderEmail(email, userName, fakeEvent, "SmartLearn Test");
}
