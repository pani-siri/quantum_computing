
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, LearningAgent, Task, ScheduleEvent, SubTopic, Difficulty, ChatMessage, AcademicBundle, Module, CognitiveLoadState, MasteryState } from './types';
import { firebaseService } from './services/firebaseService';
import { fastapiService } from './services/fastapiService';
import { authApi } from './services/authApi';
import { gmailApi } from './services/gmailApi';
import Dashboard from './components/Dashboard';
import StudySession from './components/StudySession';
import Planner from './components/Planner';
import Profile from './components/Profile';
import FinalAssessmentView from './components/FinalAssessmentView';
import AbstractBackground from './components/AbstractBackground';
import Navbar from './components/Navbar';
import { Trophy, Sparkles, Home, Calendar, Zap, User as UserIcon } from 'lucide-react';

const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<'home' | 'planner' | 'stats' | 'me'>('home');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthMode, setIsAuthMode] = useState<'login' | 'register'>('login');
  const [authStep, setAuthStep] = useState<'auth' | 'registerOtp' | 'forgotEmail' | 'resetOtp' | 'resetPassword'>('auth');
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  
  const [agents, setAgents] = useState<LearningAgent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{ agentId: string, subtopic: SubTopic } | null>(null);
  const [isFinalAssessmentOpen, setIsFinalAssessmentOpen] = useState(false);

  const [authData, setAuthData] = useState({ name: '', email: '', password: '' });

  const [forgotEmail, setForgotEmail] = useState('');
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');

  const googleClientId = useMemo(() => (process.env.GOOGLE_CLIENT_ID as string | undefined), []);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleRenderedRef = useRef(false);
  const [googleReady, setGoogleReady] = useState(false);

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailLastSyncAt, setGmailLastSyncAt] = useState<string | null>(null);
  const [showGmailPrompt, setShowGmailPrompt] = useState(false);
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    document.title = 'SmartLearn';
    const onFocus = () => {
      document.title = 'SmartLearn';
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // --- Session Persistence ---
  // Restore logged-in user on page load / refresh
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fb_session');
      if (saved) {
        const user = JSON.parse(saved);
        if (user?.uid && user?.email) {
          setCurrentUser(user);
        }
      }
    } catch {
      localStorage.removeItem('fb_session');
    }
  }, []);

  // Sync currentUser to localStorage — saves on login, clears on logout
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('fb_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('fb_session');
    }
  }, [currentUser]);
  const syncTimerRef = useRef<number | null>(null);
  
  const [newAgent, setNewAgent] = useState({ name: '', syllabus: '' });
  // Default to 12 days as requested for the project completion timeline
  const [timeframeValue, setTimeframeValue] = useState(12);
  const [timeframeUnit, setTimeframeUnit] = useState('day');
  const [difficultyLevel, setDifficultyLevel] = useState('Beginner');
  const [learningStyle, setLearningStyle] = useState('Practical');
  const [dailyHours, setDailyHours] = useState(2);
  const [referenceTextbook, setReferenceTextbook] = useState('');

  useEffect(() => {
    if (currentUser) {
      firebaseService.getAgents(currentUser.uid).then(setAgents).catch(() => {});
      firebaseService.getTasks(currentUser.uid).then(setTasks).catch(() => {});
      firebaseService.getSchedule(currentUser.uid).then(setSchedule).catch(() => {});
    }
  }, [currentUser]);

  const refreshGmailStatus = async (uid: string) => {
    const status = await gmailApi.status(uid);
    setGmailConnected(status.connected);
    setGmailLastSyncAt(status.lastSyncAt || null);
  };

  const connectGmail = async (uid: string) => {
    const url = await gmailApi.getOAuthUrl(uid);
    window.location.href = url;
  };

  const disconnectGmail = async (uid: string) => {
    await gmailApi.disconnect(uid);
    setGmailConnected(false);
    setGmailLastSyncAt(null);
  };

  const mergeImportedTasks = async (uid: string, incoming: any[]) => {
    const incomingArr = Array.isArray(incoming) ? incoming : [];
    let invalidDeadlineCount = 0;
    let expiredDeadlineCount = 0;

    const now = Date.now();

    const normalizedIncoming = incomingArr
      .map((t: any) => {
        const deadlineDate = new Date(t?.deadline);
        if (Number.isNaN(deadlineDate.getTime())) {
          invalidDeadlineCount += 1;
          return null;
        }

        if (deadlineDate.getTime() < now) {
          expiredDeadlineCount += 1;
          return null;
        }

        const title = String(t?.title || '').trim();
        if (!title) return null;
        return {
          id: Math.random().toString(36).substr(2, 9),
          user_id: uid,
          title,
          deadline: deadlineDate.toISOString(),
          priority: (t?.priority === 'high' || t?.priority === 'medium' || t?.priority === 'low') ? t.priority : 'medium',
          source: 'Email'
        };
      })
      .filter(Boolean) as any[];

    const persistedTasks = await firebaseService.getTasks(uid);
    const existingTasks = [...persistedTasks, ...tasks].filter((t, idx, arr) => {
      if (!t) return false;
      if (t.user_id !== uid) return false;
      const key = `${String(t.title || '').toLowerCase()}|${new Date(t.deadline).toISOString().slice(0, 16)}`;
      return arr.findIndex(o => `${String(o.title || '').toLowerCase()}|${new Date(o.deadline).toISOString().slice(0, 16)}` === key) === idx;
    });
    const existingTaskKey = new Set(existingTasks.map(p => `${p.title.toLowerCase()}|${new Date(p.deadline).toISOString().slice(0, 16)}`));
    const taskAdditions = normalizedIncoming.filter((t: any) => {
      const key = `${t.title.toLowerCase()}|${new Date(t.deadline).toISOString().slice(0, 16)}`;
      if (existingTaskKey.has(key)) return false;
      existingTaskKey.add(key);
      return true;
    });

    const mergedTasks = [...taskAdditions, ...existingTasks];
    firebaseService.saveTasks(uid, mergedTasks);
    setTasks(mergedTasks);

    const persistedSchedule = await firebaseService.getSchedule(uid);
    const existingSchedule = [...persistedSchedule, ...schedule].filter((e, idx, arr) => {
      if (!e) return false;
      if (e.user_id !== uid) return false;
      const key = `${e.type}|${String(e.title || '').toLowerCase()}|${new Date(e.start_time).toISOString().slice(0, 16)}`;
      return arr.findIndex(o => `${o.type}|${String(o.title || '').toLowerCase()}|${new Date(o.start_time).toISOString().slice(0, 16)}` === key) === idx;
    });
    const existingEventKey = new Set(existingSchedule.map(e => `${e.type}|${e.title.toLowerCase()}|${new Date(e.start_time).toISOString().slice(0, 16)}`));
    const deadlineEvents: ScheduleEvent[] = normalizedIncoming.map((t: any) => {
      const start = new Date(t.deadline);
      const end = new Date(start);
      end.setMinutes(start.getMinutes() + 15);
      return {
        id: Math.random().toString(36).substr(2, 9),
        user_id: uid,
        title: `Deadline: ${t.title}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        type: 'deadline' as const
      };
    }).filter(ev => {
      const key = `${ev.type}|${ev.title.toLowerCase()}|${new Date(ev.start_time).toISOString().slice(0, 16)}`;
      if (existingEventKey.has(key)) return false;
      existingEventKey.add(key);
      return true;
    });

    const mergedSchedule = [...deadlineEvents, ...existingSchedule];
    firebaseService.saveSchedule(uid, mergedSchedule);
    setSchedule(mergedSchedule);

    return {
      extractedCount: incomingArr.length,
      invalidDeadlineCount,
      expiredDeadlineCount,
      validCount: normalizedIncoming.length,
      addedTasks: taskAdditions.length,
      addedEvents: deadlineEvents.length
    };
  };

  const syncTasksFromGmail = async (opts?: { silent?: boolean }) => {
    if (!currentUser) return;
    if (syncInProgressRef.current) {
      if (!opts?.silent) alert('Gmail sync is already in progress. Please wait a moment and try again.');
      return;
    }

    syncInProgressRef.current = true;
    try {
      const uid = currentUser.uid;
      const status = await gmailApi.status(uid);
      setGmailConnected(status.connected);
      setGmailLastSyncAt(status.lastSyncAt || null);

      if (!status.connected) {
        if (!opts?.silent) alert('Please connect Gmail first.');
        return;
      }

      const dailyKey = `gmail_full_rescan_at_${uid}`;
      const lastFull = Number(localStorage.getItem(dailyKey) || '0');
      const shouldFullRescan = opts?.silent ? (Date.now() - lastFull > 24 * 60 * 60 * 1000) : true;
      const query = shouldFullRescan ? 'newer_than:180d' : 'newer_than:30d';
      const force = shouldFullRescan;

      let pageToken: string | undefined = undefined;
      const collected: any[] = [];
      let pages = 0;
      const maxPages = shouldFullRescan ? 6 : 2;
      const perPage = 50;

      while (pages < maxPages) {
        const page = await gmailApi.fetchMessages(uid, { q: query, max: perPage, force, pageToken });
        collected.push(...page.messages);
        pageToken = page.nextPageToken || undefined;
        pages += 1;
        if (!pageToken) break;
      }

      if (!collected.length) {
        if (!opts?.silent) alert('No emails found to scan.');
        return;
      }

      const maxToProcess = shouldFullRescan ? 120 : 40;
      const toProcess = collected.slice(0, maxToProcess);
      const allExtracted: any[] = [];

      const isNoiseEmail = (m: any) => {
        const from = String(m?.from || '').toLowerCase();
        const subject = String(m?.subject || '').toLowerCase();
        const snippet = String(m?.snippet || '').toLowerCase();
        const body = String(m?.body || '').toLowerCase();
        const headerHay = `${from} ${subject}`;
        const contentHay = `${subject} ${snippet} ${body}`;

        const noisePhrases = [
          'verification code',
          'security code',
          'one-time password',
          'one time password',
          'two-factor',
          'two factor',
          'password reset',
          'reset your password',
          'login code',
          'sign-in code',
          'sign in code',
          'verify your email',
          'confirm your email'
        ];

        if (noisePhrases.some(p => headerHay.includes(p))) return true;

        if (/\botp\b/.test(headerHay) || /\b2fa\b/.test(headerHay)) return true;

        const strongOtpSignal = /(otp|one[- ]time password|verification code|security code|login code|sign[- ]in code)[^\d]{0,30}\b\d{4,8}\b/i;
        if (strongOtpSignal.test(contentHay)) return true;

        return false;
      };

      const isNoiseTaskTitle = (t: any) => {
        const title = String(t?.title || '').toLowerCase();
        if (!title) return true;
        if (/\botp\b/.test(title)) return true;
        const bad = ['verification code', 'security code', 'login code', 'password reset', 'verify email'];
        return bad.some(b => title.includes(b));
      };

      let skippedNoise = 0;
      let processed = 0;
      let skippedNoDeadlineSignal = 0;
      let extractionFailures = 0;
      let emptyExtractions = 0;
      let firstExtractionError: string | null = null;

      const monthIndex = (m: string) => {
        const key = m.slice(0, 3).toLowerCase();
        const months: Record<string, number> = {
          jan: 0,
          feb: 1,
          mar: 2,
          apr: 3,
          may: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          nov: 10,
          dec: 11
        };
        return months[key];
      };

      const normalizeDeadline = (d: Date, hasTime: boolean) => {
        const out = new Date(d);
        if (!hasTime) {
          out.setHours(23, 59, 0, 0);
        }
        return out;
      };

      const inferYear = (month0: number, day: number, yearMaybe?: number) => {
        const now = new Date();
        const y = typeof yearMaybe === 'number' && yearMaybe >= 100 ? yearMaybe : now.getFullYear();
        const candidate = new Date(y, month0, day, 23, 59, 0, 0);
        if (candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
          candidate.setFullYear(y + 1);
        }
        return candidate;
      };

      const parseDeadlineFromText = (text: string) => {
        const t = String(text || '');
        const tl = t.toLowerCase();

        const dueWindowMatch = tl.match(/\b(due|deadline|submit(?:\s+by)?|submission|exam|test|quiz|last\s+date(?:\s+to)?)\b[\s\S]{0,120}/i);
        const scope = dueWindowMatch ? t.slice(dueWindowMatch.index || 0, (dueWindowMatch.index || 0) + (dueWindowMatch[0]?.length || 0)) : t;

        const iso = scope.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
        if (iso) {
          const year = Number(iso[1]);
          const month0 = Number(iso[2]) - 1;
          const day = Number(iso[3]);
          const hasTime = typeof iso[4] !== 'undefined' && typeof iso[5] !== 'undefined';
          const hour = hasTime ? Number(iso[4]) : 23;
          const minute = hasTime ? Number(iso[5]) : 59;
          const dt = new Date(year, month0, day, hour, minute, 0, 0);
          return normalizeDeadline(dt, hasTime);
        }

        const mdy = scope.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
        if (mdy) {
          let a = Number(mdy[1]);
          let b = Number(mdy[2]);
          let yRaw = mdy[3] ? Number(mdy[3]) : undefined;
          if (typeof yRaw === 'number' && yRaw < 100) yRaw = 2000 + yRaw;

          let day = a;
          let month0 = b - 1;
          if (b > 12 && a <= 12) {
            day = b;
            month0 = a - 1;
          }
          const inferred = inferYear(month0, day, yRaw);
          return normalizeDeadline(inferred, false);
        }

        const monthName1 = scope.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i);
        if (monthName1) {
          const month0 = monthIndex(monthName1[1]);
          const day = Number(monthName1[2]);
          const yearMaybe = monthName1[3] ? Number(monthName1[3]) : undefined;
          const inferred = inferYear(month0, day, yearMaybe);
          return normalizeDeadline(inferred, false);
        }

        const monthName2 = scope.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:,?\s*(20\d{2}))?/i);
        if (monthName2) {
          const day = Number(monthName2[1]);
          const month0 = monthIndex(monthName2[2]);
          const yearMaybe = monthName2[3] ? Number(monthName2[3]) : undefined;
          const inferred = inferYear(month0, day, yearMaybe);
          return normalizeDeadline(inferred, false);
        }

        return null;
      };

      const extractDeadlineTasksHeuristic = (m: any) => {
        const subject = String(m?.subject || '').trim();
        const text = `${subject}\n${m?.snippet || ''}\n${m?.body || ''}`;
        const deadline = parseDeadlineFromText(text);
        if (!deadline) return [];

        if (deadline.getTime() < Date.now()) return [];

        const lowSubject = subject.toLowerCase();
        const priority = (lowSubject.includes('urgent') || lowSubject.includes('asap') || lowSubject.includes('today') || lowSubject.includes('tomorrow')) ? 'high' : 'medium';

        return [
          {
            title: subject || 'Email deadline',
            deadline: deadline.toISOString(),
            priority,
            source: 'Email'
          }
        ];
      };

      const hasDeadlineSignal = (m: any) => {
        const hay = `${m?.subject || ''} ${m?.snippet || ''} ${m?.body || ''}`.toLowerCase();
        const signals = [
          'due',
          'deadline',
          'submit',
          'submission',
          'exam',
          'test',
          'quiz',
          'assignment',
          'project',
          'presentation',
          'viva',
          'register',
          'registration',
          'fee',
          'payment',
          'last date',
          'before',
          'by '
        ];

        if (signals.some(s => hay.includes(s))) return true;
        if (/\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/.test(hay)) return true;
        if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(hay)) return true;
        return false;
      };

      const candidates: any[] = [];

      for (const m of toProcess) {
        if (isNoiseEmail(m)) {
          skippedNoise += 1;
          continue;
        }
        processed += 1;
        if (!hasDeadlineSignal(m)) {
          skippedNoDeadlineSignal += 1;
          continue;
        }
        candidates.push(m);
      }

      for (const m of candidates) {
        try {
          const extracted = extractDeadlineTasksHeuristic(m);
          if (Array.isArray(extracted) && extracted.length) {
            const filtered = extracted.filter((t: any) => !isNoiseTaskTitle(t));
            allExtracted.push(...filtered);
          } else {
            emptyExtractions += 1;
          }
        } catch (err: any) {
          extractionFailures += 1;
          const msg = String(err?.message || err || 'Unknown error');
          if (!firstExtractionError) firstExtractionError = msg;
        }
      }

      const summary = await mergeImportedTasks(uid, allExtracted);

      if (shouldFullRescan) {
        localStorage.setItem(dailyKey, String(Date.now()));
      }

      if (!opts?.silent) {
        if (summary.validCount === 0) {
          const diag = `processed: ${processed}, skippedNoise: ${skippedNoise}, skippedNoSignal: ${skippedNoDeadlineSignal}, candidates: ${candidates.length}, empty: ${emptyExtractions}, failed: ${extractionFailures}`;
          const errLine = firstExtractionError ? `\nFirst error: ${firstExtractionError}` : '';
          alert(`Scanned ${toProcess.length} emails (${diag}). Extracted ${summary.extractedCount} items, but 0 were usable (expired: ${summary.expiredDeadlineCount}, invalid: ${summary.invalidDeadlineCount}).${errLine}`);
        } else {
          alert(`Scanned ${toProcess.length} emails (processed: ${processed}, skipped: ${skippedNoise}). Added ${summary.addedTasks} tasks. Filtered expired: ${summary.expiredDeadlineCount}.`);
        }
      }

      await refreshGmailStatus(uid);
    } catch (err: any) {
      if (!opts?.silent) alert(err.message || 'Failed to sync from Gmail.');
    } finally {
      syncInProgressRef.current = false;
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get('gmail');
    if (!gmail) return;

    params.delete('gmail');
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ''}`;
    window.history.replaceState({}, '', url);

    if (gmail === 'connected') {
      alert('Gmail connected.');
      if (currentUser) {
        refreshGmailStatus(currentUser.uid).then(() => syncTasksFromGmail({ silent: true }));
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    refreshGmailStatus(currentUser.uid)
      .then(() => syncTasksFromGmail({ silent: true }))
      .catch(() => {});

    const dismissedKey = `gmail_prompt_dismissed_${currentUser.uid}`;
    if (!localStorage.getItem(dismissedKey)) {
      gmailApi.status(currentUser.uid).then(s => {
        if (!s.connected) setShowGmailPrompt(true);
      }).catch(() => {});
    }

    if (syncTimerRef.current) window.clearInterval(syncTimerRef.current);
    syncTimerRef.current = window.setInterval(() => {
      syncTasksFromGmail({ silent: true });
    }, 5 * 60 * 1000);

    return () => {
      if (syncTimerRef.current) window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    };
  }, [currentUser]);

  useEffect(() => {
    const check = () => {
      const g = (window as any).google;
      if (g?.accounts?.id) setGoogleReady(true);
    };

    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    googleRenderedRef.current = false;
  }, [authStep, isAuthMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (authStep !== 'auth') return;

      if (isAuthMode === 'register') {
        const newUser = await firebaseService.register(authData);
        setCurrentUser(newUser);
        return;
      }

      const user = await firebaseService.login(authData.email, authData.password);
      if (user) {
        setCurrentUser(user);
      } else {
        throw new Error("Invalid credentials.");
      }
    } catch (err: any) {
      alert(err.message || "Authentication failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };


  const handleSendResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await authApi.sendOtp(forgotEmail, 'reset');
      setResetOtpCode('');
      setAuthStep('resetOtp');
    } catch (err: any) {
      alert(err.message || 'Failed to send OTP.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await authApi.verifyOtp(forgotEmail, 'reset', resetOtpCode);
      setResetPassword('');
      setResetPasswordConfirm('');
      setAuthStep('resetPassword');
    } catch (err: any) {
      alert(err.message || 'OTP verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDoResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (!resetPassword || resetPassword.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      if (resetPassword !== resetPasswordConfirm) {
        throw new Error('Passwords do not match.');
      }

      await firebaseService.resetPassword(forgotEmail, resetPassword);
      alert('Password reset. Please log in.');
      setIsAuthMode('login');
      setAuthStep('auth');
      setForgotEmail('');
      setResetOtpCode('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setAuthData(prev => ({ ...prev, email: '', password: '' }));
    } catch (err: any) {
      alert(err.message || 'Password reset failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!googleClientId) return;
    if (!googleReady) return;
    if (authStep !== 'auth' || isAuthMode !== 'login') return;
    if (!googleButtonRef.current) return;
    if (googleRenderedRef.current) return;

    const googleAny = (window as any).google;
    if (!googleAny?.accounts?.id) return;

    googleAny.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response: any) => {
        try {
          setAuthLoading(true);
          const profile = await authApi.verifyGoogleCredential(response.credential);
          const user = await firebaseService.loginWithGoogle(profile.email, profile.name);
          setCurrentUser(user);
        } catch (err: any) {
          alert(err.message || 'Google sign-in failed.');
        } finally {
          setAuthLoading(false);
        }
      }
    });

    googleButtonRef.current.innerHTML = '';
    googleAny.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      width: 360
    });

    googleRenderedRef.current = true;
  }, [authStep, googleClientId, googleReady, isAuthMode]);

  const handleCreateAgent = async () => {
    if (!currentUser || !newAgent.name) return;
    setLoading(true);
    try {
      const timeframe = `${timeframeValue} ${timeframeUnit}${timeframeValue > 1 ? 's' : ''}`;
      const agent = await fastapiService.synthesizeRoadmap(newAgent.name, timeframe, newAgent.syllabus, currentUser, {
        difficultyLevel,
        learningStyle,
        dailyHours,
        referenceTextbook
      });
      
      // Generate initial schedule events for the new roadmap
      const newEvents: ScheduleEvent[] = [];
      const today = new Date();
      today.setHours(10, 0, 0, 0); // Start studies at 10 AM daily

      agent.roadmap.forEach((module) => {
        module.subtopics.forEach((sub) => {
          const studyStart = new Date(today);
          // offset by day_number (Day 1 is today, Day 2 is tomorrow, etc)
          studyStart.setDate(today.getDate() + (sub.day_number - 1));
          
          const studyEnd = new Date(studyStart);
          studyEnd.setHours(studyStart.getHours() + 2); // Standard 2 hour sessions

          newEvents.push({
            id: Math.random().toString(36).substr(2, 9),
            user_id: currentUser.uid,
            title: `Study: ${sub.title}`,
            start_time: studyStart.toISOString(),
            end_time: studyEnd.toISOString(),
            type: 'study',
            agent_id: agent.id,
            subtopic_id: sub.id
          });
        });
      });

      // Update local and persistence states
      setAgents(prev => [...prev, agent]);
      firebaseService.saveAgent(agent);
      
      const updatedSchedule = [...schedule, ...newEvents];
      
      // Immediately run the QAOA Optimizer to resolve any overlaps
      const optimized = await fastapiService.computeOptimalSchedule(tasks, updatedSchedule);
      
      setSchedule(optimized);
      if (currentUser) firebaseService.saveSchedule(currentUser.uid, optimized);

      setIsAgentModalOpen(false);
      setNewAgent({ name: '', syllabus: '' });
      // Reset defaults
      setTimeframeValue(12);
      setTimeframeUnit('day');
      setDifficultyLevel('Beginner');
      setLearningStyle('Practical');
      setDailyHours(2);
      setReferenceTextbook('');
    } catch (err) {
      console.error(err);
      const msg = (err as any)?.message ? String((err as any).message) : "Failed to synthesize roadmap. Check your connection.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionComplete = async (stats: { focusTime: number, distractions: number, bundle: AcademicBundle, loadState: CognitiveLoadState, quizScore?: number, wrongAnswers?: string[] }) => {
    if (!activeSession) return;

    const quizScore = typeof stats.quizScore === 'number' ? stats.quizScore : null;
    let weakConcepts: string[] = stats.wrongAnswers || [];

    // Build revision notes block from wrong answers for the next subtopic
    let revisionBlock = '';
    if (weakConcepts.length > 0) {
      const lines = weakConcepts.map((w, i) => `${i + 1}. ${w}`).join('\n');
      revisionBlock = `\n\n📝 REVISION FROM PREVIOUS LESSON (${activeSession.subtopic.title})\n${'─'.repeat(50)}\nYou missed ${weakConcepts.length} question(s) in the previous quiz. Review these concepts:\n\n${lines}\n\n${'─'.repeat(50)}\n`;
    }

    // Determine if we need a full review subtopic (only for severe struggle)
    let shouldInjectReview = false;
    if (quizScore !== null && quizScore < 40 && weakConcepts.length >= 2) {
      try {
        const masteryResult = await fastapiService.classifyMastery(quizScore);
        if (masteryResult.state === MasteryState.STRUGGLE) {
          shouldInjectReview = true;
        }
      } catch {
        shouldInjectReview = true; // be safe — inject review on error
      }
    }
    
    setAgents(prev => {
      const newAgents = prev.map(a => {
        if (a.id !== activeSession.agentId) return a;
        
        let updatedRoadmap: Module[] = a.roadmap.map(m => ({
          ...m,
          subtopics: m.subtopics.map(s => s.id === activeSession.subtopic.id 
            ? { ...s, is_completed: true, is_synthesized: true, bundle: stats.bundle, quiz_score: quizScore ?? undefined, weak_concepts: weakConcepts.length ? weakConcepts : undefined } 
            : s
          )
        }));

        // Find the next subtopic and prepend revision content to its notes
        if (revisionBlock) {
          let foundCurrent = false;
          for (const mod of updatedRoadmap) {
            for (const sub of mod.subtopics) {
              if (sub.id === activeSession.subtopic.id) {
                foundCurrent = true;
                continue;
              }
              if (foundCurrent && !sub.is_completed) {
                // Prepend revision into existing bundle notes, or store for later
                if (sub.bundle?.notes) {
                  sub.bundle = { ...sub.bundle, notes: revisionBlock + sub.bundle.notes };
                } else {
                  // Store revision for when this subtopic gets synthesized
                  sub.weak_concepts = weakConcepts;
                }
                break; // only inject into the immediate next subtopic
              }
            }
            if (foundCurrent) break;
          }
        }

        // Inject a full review subtopic only for severe struggle (< 40%)
        if (shouldInjectReview && weakConcepts.length > 0) {
          const currentSub = activeSession.subtopic;
          const reviewSubtopic: SubTopic = {
            id: `review_${currentSub.id}_${Date.now()}`,
            module_id: currentSub.module_id,
            title: `Review: ${currentSub.title}`,
            day_number: currentSub.day_number + 0.5,
            daily_goals: ['Reinforce weak concepts', 'Practice missed areas'],
            difficulty: Difficulty.EASY,
            is_completed: false,
            is_review: true,
            review_of: currentSub.id,
            weak_concepts: weakConcepts
          };

          updatedRoadmap = updatedRoadmap.map(m => {
            if (m.id === currentSub.module_id || m.subtopics.some(s => s.id === currentSub.id)) {
              const insertIdx = m.subtopics.findIndex(s => s.id === currentSub.id) + 1;
              const newSubs = [...m.subtopics];
              newSubs.splice(insertIdx, 0, reviewSubtopic);
              return { ...m, subtopics: newSubs };
            }
            return m;
          });
        }
        
        const totalNodes = updatedRoadmap.reduce((acc, m) => acc + m.subtopics.filter(s => !s.is_review).length, 0);
        const completedNodes = updatedRoadmap.reduce((acc, m) => acc + m.subtopics.filter(s => s.is_completed && !s.is_review).length, 0);
        
        const updatedAgent: LearningAgent = {
          ...a,
          roadmap: updatedRoadmap,
          progress: Math.round((completedNodes / totalNodes) * 100),
          total_focus_time: (a.total_focus_time || 0) + stats.focusTime,
          total_distractions: (a.total_distractions || 0) + stats.distractions,
          cognitive_history: [...(a.cognitive_history || []), { timestamp: new Date().toISOString(), state: stats.loadState }],
          last_activity: new Date().toISOString()
        };
        firebaseService.saveAgent(updatedAgent);

        // Log analytics event
        firebaseService.saveAnalytics(updatedAgent.user_id, updatedAgent.id, 'session', {
          subtopic_id: activeSession.subtopic.id,
          subtopic_title: activeSession.subtopic.title,
          focus_time: stats.focusTime,
          distractions: stats.distractions,
          cognitive_load: stats.loadState,
          quiz_score: quizScore,
          weak_concepts: weakConcepts,
          progress: updatedAgent.progress
        }).catch(() => {});

        return updatedAgent;
      });
      return newAgents;
    });
    setActiveSession(null);
  };

  const handleFinalComplete = (result: { score: number, feedback: string, weak_areas: string[] }) => {
    if (!selectedAgentId) return;
    setAgents(prev => {
      const updated = prev.map(a => {
        if (a.id === selectedAgentId) {
          const updatedAgent: LearningAgent = {
            ...a,
            final_assessment: {
              ...(a.final_assessment || { objective_questions: [], subjective_questions: [] }),
              is_completed: true,
              score: result.score,
              feedback: result.feedback,
              weak_areas: result.weak_areas
            }
          };
          firebaseService.saveAgent(updatedAgent);

          // Log final assessment analytics
          firebaseService.saveAnalytics(updatedAgent.user_id, updatedAgent.id, 'final_assessment', {
            score: result.score,
            feedback: result.feedback,
            weak_areas: result.weak_areas
          }).catch(() => {});

          return updatedAgent;
        }
        return a;
      });
      return updated;
    });
    setIsFinalAssessmentOpen(false);
  };

  const handleUpdateAgentChat = (agentId: string, messages: ChatMessage[]) => {
    setAgents(prev => {
      const updated = prev.map(a => {
        if (a.id === agentId) {
          const updatedAgent = { ...a, chat_history: messages };
          firebaseService.saveAgent(updatedAgent);
          return updatedAgent;
        }
        return a;
      });
      return updated;
    });
  };

  const handleStartSessionFromPlanner = (agentId: string, subtopicId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    const subtopic = agent.roadmap.flatMap(m => m.subtopics).find(s => s.id === subtopicId);
    if (subtopic) setActiveSession({ agentId, subtopic });
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen figma-bg flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        <AbstractBackground />

        <div className="w-full max-w-[420px] relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {authStep === 'auth' && (
            <div className="figma-glass p-8 sm:p-10 flex flex-col items-center shadow-2xl">
              
              <div className="w-full text-left pt-2">
                <h3 className="text-[28px] font-semibold text-white mb-6 leading-tight">
                  {isAuthMode === 'login' ? 'Login' : 'Join Us'}
                </h3>
                
                <form className="space-y-4" onSubmit={handleAuth}>
                  {isAuthMode === 'register' && (
                     <div className="space-y-1">
                        <label className="text-white text-sm font-medium">Full Name</label>
                        <input 
                          type="text" 
                          placeholder="Your Name" 
                          className="figma-input"
                          value={authData.name} 
                          onChange={e => setAuthData({...authData, name: e.target.value})} 
                          required 
                        />
                     </div>
                  )}
                  
                  <div className="space-y-1">
                    <label className="text-white text-sm font-medium">Email</label>
                    <input 
                      type="email" 
                      placeholder="username@gmail.com" 
                      className="figma-input"
                      value={authData.email} 
                      onChange={e => setAuthData({...authData, email: e.target.value})} 
                      required 
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-white text-sm font-medium">Password</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        placeholder="Password" 
                        className="figma-input pr-10"
                        value={authData.password} 
                        onChange={e => setAuthData({...authData, password: e.target.value})} 
                        required 
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#555] transition-colors focus:outline-none">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                    </div>
                  </div>
                  
                  {isAuthMode === 'login' && (
                    <div className="flex justify-start pt-1">
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(authData.email || ''); setAuthStep('forgotEmail'); }}
                        className="text-white/90 hover:text-white text-sm font-medium transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}

                  <div className="pt-2">
                    <button 
                      type="submit" 
                      disabled={authLoading}
                      className="figma-btn"
                    >
                      {authLoading ? 'Verifying...' : isAuthMode === 'register' ? 'Register' : 'Sign in'}
                    </button>
                  </div>
                </form>

                <div className="mt-8 text-center pt-2">
                  <p className="text-white/90 text-sm mb-5 font-medium">or continue with</p>
                  <div className="flex justify-center gap-4">
                     <div className="relative group overflow-hidden rounded-lg">
                       <button type="button" className="figma-social-btn">
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                         </svg>
                       </button>
                       {isAuthMode === 'login' && (
                         <div className="absolute inset-0 opacity-0 z-10 overflow-hidden cursor-pointer" title="Sign in with Google">
                           <div ref={googleButtonRef} className="-ml-2 -mt-2 scale-[2] origin-top-left" />
                         </div>
                       )}
                     </div>
                  </div>
                </div>

                <div className="mt-8 text-center pt-2 pb-2">
                  <p className="text-white/90 text-sm font-medium">
                    {isAuthMode === 'register' ? "Already have an account?" : "Don't have an account yet?"}{' '}
                    <button type="button" className="text-white font-bold hover:underline" onClick={() => setIsAuthMode(isAuthMode === 'login' ? 'register' : 'login')}>
                      {isAuthMode === 'register' ? "Sign in" : "Register for free"}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          )}


          {authStep === 'forgotEmail' && (
            <form className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5 text-left" onSubmit={handleSendResetOtp}>
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Reset Password</p>
                <p className="text-sm font-bold text-slate-700">Enter your email to receive a reset OTP.</p>
              </div>
              <input
                type="email"
                placeholder="Email Address"
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold focus:border-indigo-500 transition-colors"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {authLoading ? 'Sending...' : 'Send OTP'}
              </button>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <button type="button" onClick={() => { setAuthStep('auth'); setIsAuthMode('login'); }} className="underline hover:text-slate-600">Back to login</button>
              </p>
            </form>
          )}

          {authStep === 'resetOtp' && (
            <form className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5 text-left" onSubmit={handleVerifyResetOtp}>
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Verify Reset OTP</p>
                <p className="text-sm font-bold text-slate-700">We sent a 6-digit code to <span className="font-black">{forgotEmail}</span></p>
              </div>
              <input
                inputMode="numeric"
                placeholder="Enter OTP"
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-black tracking-widest text-center text-lg focus:border-indigo-500 transition-colors"
                value={resetOtpCode}
                onChange={e => setResetOtpCode(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {authLoading ? 'Verifying...' : 'Verify OTP'}
              </button>
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                <button type="button" onClick={() => setAuthStep('forgotEmail')} className="underline hover:text-slate-600">Back</button>
                <button type="button" onClick={async () => { try { setAuthLoading(true); await authApi.sendOtp(forgotEmail, 'reset'); alert('OTP resent.'); } catch (e: any) { alert(e.message || 'Failed to resend OTP.'); } finally { setAuthLoading(false); } }} className="underline hover:text-slate-600">Resend</button>
              </div>
            </form>
          )}

          {authStep === 'resetPassword' && (
            <form className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5 text-left" onSubmit={handleDoResetPassword}>
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Set New Password</p>
                <p className="text-sm font-bold text-slate-700">Choose a new password for <span className="font-black">{forgotEmail}</span></p>
              </div>
              <div className="space-y-4">
                <input
                  type="password"
                  placeholder="New Password"
                  className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold focus:border-indigo-500 transition-colors"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold focus:border-indigo-500 transition-colors"
                  value={resetPasswordConfirm}
                  onChange={e => setResetPasswordConfirm(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {authLoading ? 'Resetting...' : 'Reset Password'}
              </button>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <button type="button" onClick={() => { setAuthStep('auth'); setIsAuthMode('login'); }} className="underline hover:text-slate-600">Back to login</button>
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  const currentAgent = agents.find(a => a.id === (activeSession?.agentId || selectedAgentId));

  return (
    <div className="min-h-screen figma-bg flex flex-col text-white pb-32 md:pb-0 relative overflow-x-hidden">
      <AbstractBackground />
      {/* Desktop Top Header (Hidden on Mobile) */}
      <Navbar 
        currentUser={currentUser} 
        activeScreen={activeScreen} 
        setActiveScreen={setActiveScreen} 
        setSelectedAgentId={setSelectedAgentId} 
        onLogout={() => setCurrentUser(null)} 
      />

      {showGmailPrompt && currentUser && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300 space-y-6">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Connect Email</p>
              <h3 className="text-2xl font-black tracking-tight">Import tasks from Gmail?</h3>
              <p className="text-sm font-bold text-slate-600">Grant read-only permission so SmartLearn can detect deadlines and add them to your scheduler automatically.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await connectGmail(currentUser.uid);
                  } catch (e: any) {
                    alert(e.message || 'Failed to start Gmail connection.');
                  }
                }}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg"
              >
                Connect Gmail
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(`gmail_prompt_dismissed_${currentUser.uid}`, '1');
                  setShowGmailPrompt(false);
                }}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-widest hover:bg-slate-200"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-32">
        {activeScreen === 'home' && (
          <div className="p-6 max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500">
            {!selectedAgentId ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                   <div className="text-white">
                      <h2 className="text-3xl font-black">My Subjects</h2>
                      <p className="text-white/70 font-medium">Continue your learning journey.</p>
                   </div>
                   <button onClick={() => setIsAgentModalOpen(true)} className="px-8 py-4 bg-white text-[#0d62bb] rounded-2xl font-black shadow-lg hover:bg-slate-50 transition-all">New Subject</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agents.map(agent => (
                    <div key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className="group figma-glass p-8 transition-all cursor-pointer hover:-translate-y-1">
                      <div className="flex justify-between items-center mb-10 text-white">
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center font-black text-2xl group-hover:bg-white group-hover:text-[#0d62bb] transition-all">
                           {agent.subject[0]}
                        </div>
                        <div className="text-right">
                           <div className="text-3xl font-black">{agent.progress}%</div>
                           <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Progress</div>
                        </div>
                      </div>
                      <h3 className="text-xl font-black text-white">{agent.subject}</h3>
                      <p className="text-xs font-bold text-white/70 mt-2">{agent.timeframe} Duration</p>
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <div className="md:col-span-3 py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl border-white/20 text-white/50 bg-white/5 backdrop-blur-sm">
                       <p className="text-lg font-bold">No subjects yet. Start your first roadmap!</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-10 pb-24">
                <button onClick={() => setSelectedAgentId(null)} className="text-xs font-bold text-indigo-600 hover:-translate-x-1 transition-transform">← Back to Subjects</button>
                <div className="flex justify-between items-end border-b pb-10">
                   <div>
                      <h2 className="text-5xl font-black tracking-tighter">{currentAgent?.subject}</h2>
                      <p className="text-slate-500 font-medium mt-2">Daily Roadmap Optimized by SmartLearn AI</p>
                   </div>
                   {currentAgent?.progress === 100 && (
                     <div className="p-4 bg-emerald-50 rounded-2xl flex items-center gap-3 border border-emerald-100">
                       <Sparkles className="text-emerald-500" size={24}/>
                       <span className="text-sm font-black text-emerald-700">Course Ready for Final Validation</span>
                     </div>
                   )}
                </div>

                <div className="space-y-16">
                   {currentAgent?.roadmap.map((mod) => (
                     <div key={mod.id} className="space-y-8">
                        <h4 className="font-black text-2xl border-l-4 border-indigo-600 pl-6">{mod.title}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           {mod.subtopics.map(sub => (
                             <div key={sub.id} onClick={() => setActiveSession({ agentId: selectedAgentId!, subtopic: sub })} className={`p-6 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between group ${sub.is_review ? 'bg-amber-50 border-amber-200 hover:border-amber-400' : sub.is_completed ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100 hover:border-indigo-400'}`}>
                                <div>
                                  <div className="flex justify-between items-center mb-4">
                                    <span className={`text-[10px] font-black px-3 py-1 rounded ${sub.is_review ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'}`}>{sub.is_review ? '🔄 Review' : `Day ${sub.day_number}`}</span>
                                    <div className="flex items-center gap-2">
                                      {typeof sub.quiz_score === 'number' && (
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded ${sub.quiz_score >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{sub.quiz_score}%</span>
                                      )}
                                      <span className="text-[9px] font-bold text-slate-400 uppercase">{sub.difficulty}</span>
                                    </div>
                                  </div>
                                  <h5 className={`font-black text-lg ${sub.is_review ? 'group-hover:text-amber-600' : 'group-hover:text-indigo-600'}`}>{sub.title}</h5>
                                  {sub.is_review && sub.weak_concepts && sub.weak_concepts.length > 0 && (
                                    <p className="text-xs font-medium text-amber-600 mt-2">Focus: {sub.weak_concepts.slice(0, 3).join(', ')}</p>
                                  )}
                                </div>
                                <div className="mt-8 pt-4 border-t border-slate-50 text-[10px] font-black uppercase tracking-widest">
                                  {sub.is_completed ? (
                                    <span className="text-emerald-600">Completed ✓</span>
                                  ) : sub.is_review ? (
                                    <span className="text-amber-600">Start Review Session →</span>
                                  ) : (
                                    <span className="text-indigo-600">Start Adaptive Lesson →</span>
                                  )}
                                </div>
                             </div>
                           ))}
                        </div>
                     </div>
                   ))}

                   {/* Final Assessment Section at Bottom */}
                   <div className="pt-24 border-t-2 border-dashed border-slate-100 text-center space-y-8">
                      <div className="w-20 h-20 bg-slate-900 text-white rounded-[2rem] mx-auto flex items-center justify-center shadow-xl">
                        <Trophy size={32}/>
                      </div>
                      <div className="max-w-md mx-auto">
                        <h4 className="text-3xl font-black italic tracking-tighter">Course Mastery Terminal</h4>
                        <p className="text-slate-500 font-medium mt-2">Validate your total understanding with a rigorous 30-question final challenge.</p>
                      </div>
                      
                      {currentAgent?.final_assessment?.is_completed ? (
                        <div className="bg-indigo-50 p-10 rounded-[3.5rem] border-2 border-indigo-100 animate-in zoom-in-95">
                          <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-2">Assessment Results</p>
                          <p className="text-6xl font-black italic text-indigo-600 mb-6">{currentAgent.final_assessment.score}%</p>
                          <div className="text-left space-y-4">
                             <p className="text-sm font-bold text-indigo-900 italic leading-relaxed">"{currentAgent.final_assessment.feedback}"</p>
                             <button onClick={() => setIsFinalAssessmentOpen(true)} className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-600 underline">Retake Mastery Challenge</button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setIsFinalAssessmentOpen(true)}
                          className={`w-full max-w-md py-7 rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl transition-all ${currentAgent?.progress === 100 ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                          disabled={currentAgent?.progress !== 100}
                        >
                          {currentAgent?.progress === 100 ? 'Launch Final Mastery Challenge' : `Complete All Lessons (${currentAgent?.progress}%)`}
                        </button>
                      )}
                      {currentAgent?.progress !== 100 && (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mastery node unlocks at 100% roadmap completion.</p>
                      )}
                   </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeScreen === 'planner' && <Planner tasks={tasks} schedule={schedule} agents={agents} onStartSession={handleStartSessionFromPlanner} />}
        {activeScreen === 'stats' && <Dashboard agents={agents} />}
        {activeScreen === 'me' && (
          <Profile
            user={currentUser}
            agents={agents}
            onLogout={() => setCurrentUser(null)}
            onUpdateUser={(u) => setCurrentUser(u)}
            gmailConnected={gmailConnected}
            gmailLastSyncAt={gmailLastSyncAt}
            onConnectGmail={async () => {
              try {
                await connectGmail(currentUser.uid);
              } catch (e: any) {
                alert(e.message || 'Failed to start Gmail connection.');
              }
            }}
            onImportGmailTasks={async () => {
              await syncTasksFromGmail({ silent: false });
            }}
            onDisconnectGmail={async () => {
              await disconnectGmail(currentUser.uid);
            }}
          />
        )}
      </main>

      <nav className="md:hidden fixed bottom-6 inset-x-4 sm:inset-x-10 figma-glass rounded-[2.5rem] h-[84px] flex items-center justify-between px-4 sm:px-8 z-50 shadow-2xl">
        {[
          { id: 'home', label: 'Subjects', icon: Home },
          { id: 'planner', label: 'Schedule', icon: Calendar },
          { id: 'stats', label: 'Velocity', icon: Zap },
          { id: 'me', label: 'Profile', icon: UserIcon }
        ].map(n => (
          <button key={n.id} onClick={() => { setActiveScreen(n.id as any); setSelectedAgentId(null); }} className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-[1.5rem] transition-all duration-300 ${activeScreen === n.id ? 'text-white' : 'text-white/50 hover:text-white/80'}`}>
            {activeScreen === n.id && (
              <span className="absolute inset-0 bg-white/20 shadow-inner rounded-[1.5rem] -z-10 animate-in zoom-in duration-300 border border-white/30"></span>
            )}
            <n.icon size={22} className={`transition-all duration-300 ${activeScreen === n.id ? 'scale-110 drop-shadow-md text-white mb-1' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'}`} />
            <span className={`text-[8px] font-black uppercase tracking-widest transition-all duration-300 ${activeScreen === n.id ? 'opacity-100 scale-100 text-white' : 'opacity-0 scale-95 h-0 overflow-hidden'}`}>{n.label}</span>
          </button>
        ))}
      </nav>

      {isAgentModalOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="figma-glass-blue figma-scrollbar rounded-[2.5rem] p-8 sm:p-10 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto border border-white/20">
              <div className="mb-8">
                 <h2 className="text-3xl font-black tracking-tight text-white">Add New Subject</h2>
                 <p className="text-sm font-medium text-white/50 mt-2">Our AI will synthesize a custom roadmap for you.</p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Subject Name</label>
                  <input type="text" placeholder="e.g. Calculus, SEO, Quantum Computing" className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold focus:border-white transition-all text-white placeholder:text-white/30 shadow-inner" value={newAgent.name} onChange={e => setNewAgent({...newAgent, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Syllabus / Key Topics</label>
                  <textarea rows={3} placeholder="Paste your syllabus or list key topics to cover..." className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-sm resize-none focus:border-white transition-all text-white placeholder:text-white/30 shadow-inner" value={newAgent.syllabus} onChange={e => setNewAgent({...newAgent, syllabus: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Duration</label>
                    <input type="number" min="1" className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-white shadow-inner focus:border-white transition-all" value={timeframeValue} onChange={e => setTimeframeValue(parseInt(e.target.value) || 1)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Unit</label>
                    <select className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-white shadow-inner focus:border-white transition-all" value={timeframeUnit} onChange={e => setTimeframeUnit(e.target.value)}>
                      <option className="bg-slate-900" value="day">Day(s)</option>
                      <option className="bg-slate-900" value="week">Week(s)</option>
                      <option className="bg-slate-900" value="month">Month(s)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Difficulty</label>
                    <select className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-sm text-white shadow-inner focus:border-white transition-all" value={difficultyLevel} onChange={e => setDifficultyLevel(e.target.value)}>
                      <option className="bg-slate-900" value="Beginner">Beginner</option>
                      <option className="bg-slate-900" value="Intermediate">Intermediate</option>
                      <option className="bg-slate-900" value="Advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Learning Style</label>
                    <select className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-sm text-white shadow-inner focus:border-white transition-all" value={learningStyle} onChange={e => setLearningStyle(e.target.value)}>
                      <option className="bg-slate-900" value="Theoretical">Theoretical</option>
                      <option className="bg-slate-900" value="Practical">Practical</option>
                      <option className="bg-slate-900" value="Fast-paced">Fast-paced</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Daily Hours</label>
                    <input type="number" min="1" max="12" className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-white shadow-inner focus:border-white transition-all" value={dailyHours} onChange={e => setDailyHours(parseInt(e.target.value) || 1)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/50 ml-2 mb-2 block">Textbook (Optional)</label>
                    <input type="text" placeholder="e.g. CLRS, Thomas Calc" className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 outline-none font-bold text-sm focus:border-white transition-all text-white placeholder:text-white/30 shadow-inner" value={referenceTextbook} onChange={e => setReferenceTextbook(e.target.value)} />
                  </div>
                </div>
                <div className="pt-4">
                  <button disabled={loading} onClick={handleCreateAgent} className="w-full py-5 bg-white text-[#0d62bb] rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl hover:bg-slate-100 disabled:opacity-50 transition-all border border-transparent hover:border-white/20">
                    {loading ? 'Synthesizing Roadmap...' : 'Generate Roadmap'}
                  </button>
                  <button onClick={() => setIsAgentModalOpen(false)} className="w-full mt-4 text-[10px] font-bold text-white/50 hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
                </div>
              </div>
           </div>
        </div>
      )}

      {activeSession && currentAgent && (
        <StudySession 
          subtopic={activeSession.subtopic} 
          agent={currentAgent}
          onExit={() => setActiveSession(null)}
          onUpdateChat={(messages) => handleUpdateAgentChat(currentAgent.id, messages)}
          onComplete={handleSessionComplete}
        />
      )}

      {isFinalAssessmentOpen && currentAgent && (
        <FinalAssessmentView 
          agent={currentAgent}
          onClose={() => setIsFinalAssessmentOpen(false)}
          onComplete={handleFinalComplete}
        />
      )}
    </div>
  );
};

export default App;
