/**
 * Gmail Deadline Extractor Service
 * 
 * Connects to Gmail via IMAP to scan recent emails for deadlines,
 * due dates, submission dates, and other time-sensitive academic events.
 * Extracts structured deadline data that can be added to the scheduler.
 */

import Imap from "imap";
import { simpleParser } from "mailparser";

// ── Deadline detection patterns ──────────────────────────────────────────────
const DEADLINE_PATTERNS = [
  // Explicit deadline keywords
  /\b(?:deadline|due\s+date|due\s+by|submit\s+by|submission\s+date|last\s+date|expires?\s+on)\s*[:\-–]?\s*(\d{1,2}[\s\/\-\.]\w+[\s\/\-\.]\d{2,4})/gi,
  /\b(?:deadline|due\s+date|due\s+by|submit\s+by|submission\s+date|last\s+date|expires?\s+on)\s*[:\-–]?\s*(\w+\s+\d{1,2},?\s*\d{2,4})/gi,
  /\b(?:deadline|due)\s*[:\-–]?\s*(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2})/gi,
  
  // "by [date]" pattern
  /\bby\s+(\w+\s+\d{1,2},?\s*\d{2,4})/gi,
  /\bby\s+(\d{1,2}[\s\/\-\.]\w+[\s\/\-\.]\d{2,4})/gi,
  
  // "before [date]" pattern
  /\bbefore\s+(\w+\s+\d{1,2},?\s*\d{2,4})/gi,
  
  // "on or before [date]" pattern
  /\bon\s+or\s+before\s+(\w+\s+\d{1,2},?\s*\d{2,4})/gi,
  
  // ISO-style dates near deadline keywords
  /\b(?:deadline|due|submit|submission)\b.*?(\d{4}-\d{2}-\d{2})/gi,
];

// Keywords that indicate deadline-related emails
const DEADLINE_KEYWORDS = [
  "deadline", "due date", "due by", "submit", "submission",
  "assignment", "exam", "test", "quiz", "project",
  "homework", "coursework", "assessment", "final",
  "midterm", "presentation", "report", "paper",
  "last date", "expires", "expiry", "reminder",
  "upcoming", "important date", "schedule", "calendar"
];

// Priority keywords
const HIGH_PRIORITY_KEYWORDS = [
  "urgent", "important", "final", "last chance",
  "overdue", "asap", "immediately", "critical",
  "mandatory", "compulsory"
];

/**
 * Parse a date string extracted from email into a Date object
 */
function parseExtractedDate(dateStr) {
  if (!dateStr) return null;
  
  const cleaned = dateStr.trim().replace(/,/g, "").replace(/\s+/g, " ");
  
  // Try direct parsing first
  const d = new Date(cleaned);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2020) return d;
  
  // Try common formats: "15 April 2026", "April 15 2026", "15/04/2026", "04-15-2026"
  const formats = [
    // DD/MM/YYYY or DD-MM-YYYY
    /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/,
  ];
  
  for (const fmt of formats) {
    const m = cleaned.match(fmt);
    if (m) {
      // Determine which is year, month, day
      if (m[1].length === 4) {
        // YYYY-MM-DD
        const d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!isNaN(d2.getTime())) return d2;
      } else {
        // DD/MM/YYYY — try both DD/MM and MM/DD
        const day = Number(m[1]);
        const mon = Number(m[2]);
        const yr = Number(m[3]);
        if (day <= 12) {
          // Ambiguous — prefer DD/MM
          const d2 = new Date(yr, mon - 1, day);
          if (!isNaN(d2.getTime())) return d2;
        }
        const d2 = new Date(yr, mon - 1, day);
        if (!isNaN(d2.getTime())) return d2;
      }
    }
  }
  
  return null;
}

/**
 * Extract deadline info from email text content
 */
function extractDeadlinesFromText(text, subject, from, date) {
  const deadlines = [];
  const fullText = `${subject}\n${text}`;
  
  // Check if this email is even deadline-related
  const lowerText = fullText.toLowerCase();
  const isRelevant = DEADLINE_KEYWORDS.some(kw => lowerText.includes(kw));
  if (!isRelevant) return [];
  
  // Determine priority
  const isHighPriority = HIGH_PRIORITY_KEYWORDS.some(kw => lowerText.includes(kw));
  
  // Try to extract dates from patterns
  const foundDates = new Set();
  
  for (const pattern of DEADLINE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      const dateStr = match[1];
      const parsed = parseExtractedDate(dateStr);
      if (parsed && !foundDates.has(parsed.toISOString())) {
        foundDates.add(parsed.toISOString());
        
        // Extract title — use subject or nearby context
        let title = subject || "Deadline from email";
        title = title.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim();
        if (title.length > 80) title = title.substring(0, 77) + "...";
        
        deadlines.push({
          title,
          deadline: parsed.toISOString(),
          priority: isHighPriority ? "high" : "medium",
          source: "Email",
          from: from || "Unknown",
          emailDate: date ? new Date(date).toISOString() : new Date().toISOString(),
          extractedDateStr: dateStr
        });
      }
    }
  }
  
  // If the email is relevant but no explicit date found, 
  // check if there's a future date mentioned in a simpler pattern  
  if (deadlines.length === 0 && isRelevant) {
    // Look for any future date in the text
    const genericDatePattern = /(\d{1,2}[\s\/\-\.]\w+[\s\/\-\.]\d{2,4}|\w+\s+\d{1,2},?\s*\d{2,4}|\d{4}-\d{2}-\d{2})/g;
    let match;
    while ((match = genericDatePattern.exec(fullText)) !== null) {
      const parsed = parseExtractedDate(match[1]);
      if (parsed && parsed > new Date() && !foundDates.has(parsed.toISOString())) {
        foundDates.add(parsed.toISOString());
        
        let title = subject || "Potential deadline";
        title = title.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim();
        if (title.length > 80) title = title.substring(0, 77) + "...";
        
        deadlines.push({
          title,
          deadline: parsed.toISOString(),
          priority: "low",
          source: "Email",
          from: from || "Unknown",
          emailDate: date ? new Date(date).toISOString() : new Date().toISOString(),
          extractedDateStr: match[1]
        });
        break; // Only take the first generic match
      }
    }
  }
  
  return deadlines;
}

/**
 * Connect to Gmail via IMAP and fetch recent emails, then extract deadlines
 */
export function extractGmailDeadlines() {
  return new Promise((resolve, reject) => {
    const user = process.env.OTP_EMAIL_USER;
    const password = process.env.OTP_EMAIL_APP_PASSWORD;
    
    if (!user || !password) {
      return reject(new Error("Gmail credentials not configured (OTP_EMAIL_USER / OTP_EMAIL_APP_PASSWORD)"));
    }
    
    const imap = new Imap({
      user,
      password,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 15000,
    });
    
    const allDeadlines = [];
    
    imap.once("ready", () => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }
        
        // Search for emails from the last 30 days
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toISOString().split("T")[0];
        
        imap.search(["ALL", ["SINCE", sinceStr]], (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          
          if (!results || results.length === 0) {
            imap.end();
            return resolve([]);
          }
          
          // Limit to last 50 emails to avoid timeout
          const recentIds = results.slice(-50);
          
          const fetch = imap.fetch(recentIds, {
            bodies: "",
            struct: true
          });
          
          let pending = 0;
          let fetchEnded = false;
          
          const checkDone = () => {
            if (fetchEnded && pending === 0) {
              imap.end();
              // Deduplicate and sort by deadline date
              const unique = [];
              const seen = new Set();
              for (const d of allDeadlines) {
                const key = `${d.title}|${d.deadline}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  unique.push(d);
                }
              }
              unique.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
              resolve(unique);
            }
          };
          
          fetch.on("message", (msg) => {
            pending++;
            let rawBuffer = Buffer.alloc(0);
            
            msg.on("body", (stream) => {
              stream.on("data", (chunk) => {
                rawBuffer = Buffer.concat([rawBuffer, chunk]);
              });
            });
            
            msg.once("end", async () => {
              try {
                const parsed = await simpleParser(rawBuffer);
                const subject = parsed.subject || "";
                const text = parsed.text || "";
                const from = parsed.from?.text || "";
                const date = parsed.date;
                
                const deadlines = extractDeadlinesFromText(text, subject, from, date);
                allDeadlines.push(...deadlines);
              } catch (e) {
                // Skip unparseable emails
              }
              pending--;
              checkDone();
            });
          });
          
          fetch.once("error", (err) => {
            imap.end();
            reject(err);
          });
          
          fetch.once("end", () => {
            fetchEnded = true;
            checkDone();
          });
        });
      });
    });
    
    imap.once("error", (err) => {
      reject(err);
    });
    
    imap.once("end", () => {
      // Connection ended
    });
    
    imap.connect();
  });
}
