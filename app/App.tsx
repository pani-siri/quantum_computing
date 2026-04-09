
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, LearningAgent, Task, ScheduleEvent, SubTopic, Difficulty, ChatMessage, AcademicBundle, Module, CognitiveLoadState, MasteryState, BehavioralMetrics } from './types';
import { firebaseService } from './services/firebaseService';
import { fastapiService } from './services/fastapiService';
import { authApi } from './services/authApi';

import Dashboard from './components/Dashboard';
import StudySession from './components/StudySession';
import Planner from './components/Planner';
import Profile from './components/Profile';
import FinalAssessmentView from './components/FinalAssessmentView';
import AbstractBackground from './components/AbstractBackground';
import About from './components/About';
import Navbar from './components/Navbar';
import { Trophy, Sparkles, Home, Calendar, Zap, User as UserIcon, Lock, CheckCircle2, Trash2, Plus, BrainCircuit } from 'lucide-react';

const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<'home' | 'planner' | 'stats' | 'me'>('home');
  // Only show landing if no saved session (first visit / logged out)
  const [showLanding, setShowLanding] = useState(() => {
    try { return !localStorage.getItem('fb_session'); } catch { return true; }
  });
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

  const [newAgent, setNewAgent] = useState({ name: '', syllabus: '' });
  // Default to 12 days as requested for the project completion timeline
  const [timeframeValue, setTimeframeValue] = useState(12);
  const [timeframeUnit, setTimeframeUnit] = useState('day');
  const [difficultyLevel, setDifficultyLevel] = useState('Beginner');
  const [learningStyle, setLearningStyle] = useState('Practical');
  const [dailyHours, setDailyHours] = useState(2);
  const [referenceTextbook, setReferenceTextbook] = useState('');

  // Recalculate progress from roadmap to prevent stale stored values
  const recalculateProgress = (agent: LearningAgent): number => {
    const totalNodes = agent.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => !s.is_review).length, 0);
    const completedNodes = agent.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => s.is_completed && !s.is_review).length, 0);
    return totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
  };

  // Fix duplicate subtopic IDs in existing data (legacy agents before unique ID fix)
  const deduplicateSubtopicIds = (agent: LearningAgent): LearningAgent => {
    const seenIds = new Set<string>();
    let changed = false;
    const fixedRoadmap = agent.roadmap.map(m => ({
      ...m,
      subtopics: m.subtopics.map(s => {
        // Ensure module_id is set
        const needsModuleId = !s.module_id || s.module_id !== m.id;
        // Check for duplicate ID across modules — preserve completion status
        if (seenIds.has(s.id)) {
          changed = true;
          const newId = `${m.id}_${s.id}_${Math.random().toString(36).substr(2, 4)}`;
          seenIds.add(newId);
          return { ...s, id: newId, module_id: m.id };
        }
        seenIds.add(s.id);
        if (needsModuleId) {
          changed = true;
          return { ...s, module_id: m.id };
        }
        return s;
      })
    }));
    if (changed) return { ...agent, roadmap: fixedRoadmap };
    return agent;
  };

  useEffect(() => {
    if (currentUser) {
      firebaseService.getAgents(currentUser.uid).then(async loaded => {
        const corrected = loaded.map(a => {
          // Fix duplicate subtopic IDs from legacy data
          let fixed = deduplicateSubtopicIds(a);
          // Always recalculate progress from actual roadmap data
          const correctProgress = recalculateProgress(fixed);
          if (fixed.progress !== correctProgress || fixed !== a) {
            fixed = { ...fixed, progress: correctProgress };
          }
          return fixed;
        });
        setAgents(corrected);
        // Persist any corrections after setting state
        for (const fixed of corrected) {
          const original = loaded.find(a => a.id === fixed.id);
          if (fixed !== original) {
            try { await firebaseService.saveAgent(fixed); }
            catch (e) { console.error('[SAVE] Failed to persist agent corrections:', fixed.id, e); }
          }
        }
      }).catch(e => console.error('[LOAD] Failed to load agents:', e));
      firebaseService.getTasks(currentUser.uid).then(setTasks).catch(() => {});
      firebaseService.getSchedule(currentUser.uid).then(setSchedule).catch(() => {});
    }
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
  }, [authStep, isAuthMode, showLanding]);

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
    if (authStep !== 'auth') return;
    if (showLanding) return;
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
      theme: 'filled_blue',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      width: 340
    });

    googleRenderedRef.current = true;
  }, [authStep, googleClientId, googleReady, isAuthMode, showLanding]);

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

  const handleSessionComplete = async (stats: { focusTime: number, distractions: number, bundle: AcademicBundle, loadState: CognitiveLoadState, quizScore?: number, wrongAnswers?: string[], behavioral_metrics?: BehavioralMetrics }) => {
    if (!activeSession) return;

    const quizScore = typeof stats.quizScore === 'number' ? stats.quizScore : null;
    let weakConcepts: string[] = stats.wrongAnswers || [];

    // Build revision notes block from wrong answers for the next subtopic
    let revisionBlock = '';
    if (weakConcepts.length > 0) {
      const lines = weakConcepts.map((w, i) => `${i + 1}. ${w}`).join('\n');
      revisionBlock = `\n\n--- REVISION FROM PREVIOUS LESSON (${activeSession.subtopic.title}) ---\nYou missed ${weakConcepts.length} question(s) in the previous quiz. Review these concepts:\n\n${lines}\n\n---\n`;
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
        shouldInjectReview = true;
      }
    }

    // Build the updated agent OUTSIDE the state updater so we can await the save
    const currentAgentSnapshot = agents.find(a => a.id === activeSession.agentId);
    if (!currentAgentSnapshot) { setActiveSession(null); return; }

    const targetSubId = activeSession.subtopic.id;
    const targetModId = activeSession.subtopic.module_id;
    let updatedRoadmap: Module[] = currentAgentSnapshot.roadmap.map(m => ({
      ...m,
      subtopics: m.subtopics.map(s => {
        const idMatch = s.id === targetSubId;
        const modMatch = !targetModId || m.id === targetModId || s.module_id === targetModId;
        return (idMatch && modMatch)
          ? { ...s, is_completed: true, is_synthesized: true, bundle: stats.bundle, quiz_score: quizScore ?? undefined, weak_concepts: weakConcepts.length ? weakConcepts : undefined, behavioral_metrics: stats.behavioral_metrics }
          : s;
      })
    }));

    // Find the next subtopic and prepend revision content to its notes
    if (revisionBlock) {
      let foundCurrent = false;
      outerLoop:
      for (const mod of updatedRoadmap) {
        for (const sub of mod.subtopics) {
          if (sub.id === activeSession.subtopic.id) {
            foundCurrent = true;
            continue;
          }
          if (foundCurrent && !sub.is_completed) {
            if (sub.bundle?.notes) {
              sub.bundle = { ...sub.bundle, notes: revisionBlock + sub.bundle.notes };
            } else {
              sub.weak_concepts = weakConcepts;
            }
            break outerLoop;
          }
        }
      }
    }

    // Inject a full review subtopic only for severe struggle (< 40%) — skip if one already exists
    const existingReview = updatedRoadmap.some(m => m.subtopics.some(s => s.is_review && s.review_of === activeSession.subtopic.id));
    if (shouldInjectReview && weakConcepts.length > 0 && !existingReview) {
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
      ...currentAgentSnapshot,
      roadmap: updatedRoadmap,
      progress: Math.round((completedNodes / totalNodes) * 100),
      total_focus_time: (currentAgentSnapshot.total_focus_time || 0) + stats.focusTime,
      total_distractions: (currentAgentSnapshot.total_distractions || 0) + stats.distractions,
      cognitive_history: [...(currentAgentSnapshot.cognitive_history || []), { timestamp: new Date().toISOString(), state: stats.loadState }],
      last_activity: new Date().toISOString()
    };

    // Update React state immediately
    setAgents(prev => prev.map(a => a.id === updatedAgent.id ? updatedAgent : a));
    setActiveSession(null);

    // Persist to database — AWAIT so it actually saves before user navigates away
    try {
      await firebaseService.saveAgent(updatedAgent);
      console.info('[SAVE] Agent saved successfully:', updatedAgent.id, 'progress:', updatedAgent.progress + '%');
    } catch (e) {
      console.error('[SAVE] CRITICAL: Failed to save agent progress!', e);
      // Retry once
      try {
        await firebaseService.saveAgent(updatedAgent);
        console.info('[SAVE] Agent saved on retry:', updatedAgent.id);
      } catch (e2) {
        console.error('[SAVE] Retry also failed:', e2);
      }
    }

    // Log analytics (non-critical, fire and forget with catch)
    firebaseService.saveAnalytics(updatedAgent.user_id, updatedAgent.id, 'session', {
      subtopic_id: activeSession.subtopic.id,
      subtopic_title: activeSession.subtopic.title,
      focus_time: stats.focusTime,
      distractions: stats.distractions,
      cognitive_load: stats.loadState,
      quiz_score: quizScore,
      weak_concepts: weakConcepts,
      progress: updatedAgent.progress
    }).catch(e => console.error('[ANALYTICS] session save failed:', e));

    // Check if the module containing this subtopic is now fully complete
    const completedModule = updatedRoadmap.find(m =>
      m.subtopics.some(s => s.id === activeSession.subtopic.id)
    );
    if (completedModule) {
      const coreSubtopics = completedModule.subtopics.filter(s => !s.is_review);
      const allModuleDone = coreSubtopics.length > 0 && coreSubtopics.every(s => s.is_completed);
      if (allModuleDone) {
        const scores = coreSubtopics.map(s => s.quiz_score).filter((v): v is number => typeof v === 'number');
        firebaseService.saveAnalytics(updatedAgent.user_id, updatedAgent.id, 'module_complete', {
          module_id: completedModule.id,
          module_title: completedModule.title,
          total_subtopics: coreSubtopics.length,
          avg_score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          subtopics: coreSubtopics.map(s => ({
            id: s.id,
            title: s.title,
            quiz_score: s.quiz_score ?? null,
            weak_concepts: s.weak_concepts || [],
            has_bundle: !!s.bundle,
          })),
          completed_at: new Date().toISOString(),
          module_progress: `${updatedRoadmap.filter(m => {
            const core = m.subtopics.filter(s => !s.is_review);
            return core.length > 0 && core.every(s => s.is_completed);
          }).length}/${updatedRoadmap.length}`,
        }).catch(e => console.error('[ANALYTICS] module_complete save failed:', e));
      }
    }
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
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    const updatedAgent = { ...agent, chat_history: messages };
    setAgents(prev => prev.map(a => a.id === agentId ? updatedAgent : a));
    firebaseService.saveAgent(updatedAgent).catch(e => console.error('[SAVE] chat update failed:', e));
  };

  const handleMarkReviewRead = async (agentId: string, subtopicId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    const updatedRoadmap = agent.roadmap.map(m => ({
      ...m,
      subtopics: m.subtopics.map(s =>
        s.id === subtopicId && s.is_review
          ? { ...s, is_completed: true }
          : s
      )
    }));
    const updatedAgent = { ...agent, roadmap: updatedRoadmap };
    setAgents(prev => prev.map(a => a.id === agentId ? updatedAgent : a));
    try {
      await firebaseService.saveAgent(updatedAgent);
    } catch (e) {
      console.error('[SAVE] Failed to save review mark-as-read:', e);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!currentUser) return;
    if (!confirm('Delete this subject and all its progress? This cannot be undone.')) return;
    try {
      await firebaseService.deleteAgent(agentId);
      setAgents(prev => prev.filter(a => a.id !== agentId));
      // Remove schedule events for this agent
      const updatedSchedule = schedule.filter(e => e.agent_id !== agentId);
      setSchedule(updatedSchedule);
      firebaseService.saveSchedule(currentUser.uid, updatedSchedule);
      if (selectedAgentId === agentId) setSelectedAgentId(null);
    } catch (err) {
      alert('Failed to delete subject.');
    }
  };

  const handleStartSessionFromPlanner = (agentId: string, subtopicId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    const subtopic = agent.roadmap.flatMap(m => m.subtopics).find(s => s.id === subtopicId);
    if (subtopic) setActiveSession({ agentId, subtopic });
  };

  // Show About landing page FIRST — before login or app
  if (showLanding) {
    return (
      <div className="min-h-screen figma-bg flex flex-col text-white relative overflow-x-hidden">
        <AbstractBackground />
        <div className="flex-1 overflow-y-auto">
          <About />
          <div className="text-center pb-16">
            <button
              onClick={() => setShowLanding(false)}
              className="px-14 py-6 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-2xl font-bold tracking-wide shadow-2xl shadow-[#c4b998]/20 hover:-translate-y-1 active:scale-95 transition-all text-lg"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen figma-bg flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        <AbstractBackground />
        {/* Subtle ambient glows */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#c4b998]/[0.03] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#8baa6e]/[0.02] rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[400px] relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* Logo above card */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c4b998] to-[#a89870] flex items-center justify-center shadow-lg shadow-[#c4b998]/10">
                <BrainCircuit size={20} className="text-[#111113]" />
              </div>
              <span className="text-xl font-bold text-[#e8e4dc] tracking-tight">SmartLearn</span>
            </div>
          </div>

          {authStep === 'auth' && (
            <div className="bg-[#1a1a1e] rounded-2xl p-7 sm:p-8 border border-white/[0.08] shadow-2xl shadow-black/40">

              <div className="w-full">
                <h3 className="text-2xl font-bold text-[#e8e4dc] mb-1">
                  {isAuthMode === 'login' ? 'Welcome back' : 'Create account'}
                </h3>
                <p className="text-sm text-white/30 mb-6">
                  {isAuthMode === 'login' ? 'Sign in to continue learning' : 'Start your learning journey'}
                </p>

                <form className="space-y-4" onSubmit={handleAuth}>
                  {isAuthMode === 'register' && (
                     <div className="space-y-1.5">
                        <label className="text-white/40 text-xs font-medium ml-0.5">Full Name</label>
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

                  <div className="space-y-1.5">
                    <label className="text-white/40 text-xs font-medium ml-0.5">Email</label>
                    <input
                      type="email"
                      placeholder="you@email.com"
                      className="figma-input"
                      value={authData.email}
                      onChange={e => setAuthData({...authData, email: e.target.value})}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-white/40 text-xs font-medium ml-0.5">Password</label>
                    <input
                      type="password"
                      placeholder="Enter password"
                      className="figma-input"
                      value={authData.password}
                      onChange={e => setAuthData({...authData, password: e.target.value})}
                      required
                    />
                  </div>

                  {isAuthMode === 'login' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(authData.email || ''); setAuthStep('forgotEmail'); }}
                        className="text-[#c4b998]/70 hover:text-[#c4b998] text-xs font-medium transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="figma-btn"
                    >
                      {authLoading ? 'Verifying...' : isAuthMode === 'register' ? 'Create Account' : 'Sign In'}
                    </button>
                  </div>
                </form>

                <div className="mt-6 text-center">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <span className="text-white/20 text-xs">or</span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                  </div>
                  {/* Google Sign-In: show SDK button on both login and register pages */}
                  <div className="flex justify-center">
                    {googleClientId ? (
                      <div ref={googleButtonRef} className="flex justify-center min-h-[44px]" />
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-sm font-medium flex items-center justify-center gap-3 opacity-50 cursor-not-allowed"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Continue with Google
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-white/30 text-sm">
                    {isAuthMode === 'register' ? "Already have an account?" : "Don't have an account?"}{' '}
                    <button type="button" className="text-[#c4b998] font-semibold hover:text-[#e8e4dc] transition-colors" onClick={() => setIsAuthMode(isAuthMode === 'login' ? 'register' : 'login')}>
                      {isAuthMode === 'register' ? "Sign in" : "Register"}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          )}


          {authStep === 'forgotEmail' && (
            <form className="bg-[#1a1a1e] p-7 sm:p-8 rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40 space-y-5 text-left" onSubmit={handleSendResetOtp}>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[#e8e4dc]">Reset Password</h3>
                <p className="text-sm text-white/30">Enter your email to receive a reset code.</p>
              </div>
              <input
                type="email"
                placeholder="Email Address"
                className="figma-input"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={authLoading}
                className="figma-btn"
              >
                {authLoading ? 'Sending...' : 'Send OTP'}
              </button>
              <button type="button" onClick={() => { setAuthStep('auth'); setIsAuthMode('login'); }} className="text-xs text-[#c4b998]/60 hover:text-[#c4b998] transition-colors">
                Back to login
              </button>
            </form>
          )}

          {authStep === 'resetOtp' && (
            <form className="bg-[#1a1a1e] p-7 sm:p-8 rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40 space-y-5 text-left" onSubmit={handleVerifyResetOtp}>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[#e8e4dc]">Verify Code</h3>
                <p className="text-sm text-white/30">We sent a 6-digit code to <span className="text-[#e8e4dc]">{forgotEmail}</span></p>
              </div>
              <input
                inputMode="numeric"
                placeholder="Enter OTP"
                className="figma-input text-center text-lg tracking-widest"
                value={resetOtpCode}
                onChange={e => setResetOtpCode(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={authLoading}
                className="figma-btn"
              >
                {authLoading ? 'Verifying...' : 'Verify OTP'}
              </button>
              <div className="flex justify-between text-xs">
                <button type="button" onClick={() => setAuthStep('forgotEmail')} className="text-[#c4b998]/60 hover:text-[#c4b998] transition-colors">Back</button>
                <button type="button" onClick={async () => { try { setAuthLoading(true); await authApi.sendOtp(forgotEmail, 'reset'); alert('OTP resent.'); } catch (e: any) { alert(e.message || 'Failed to resend OTP.'); } finally { setAuthLoading(false); } }} className="text-[#c4b998]/60 hover:text-[#c4b998] transition-colors">Resend</button>
              </div>
            </form>
          )}

          {authStep === 'resetPassword' && (
            <form className="bg-[#1a1a1e] p-7 sm:p-8 rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40 space-y-5 text-left" onSubmit={handleDoResetPassword}>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[#e8e4dc]">New Password</h3>
                <p className="text-sm text-white/30">Choose a new password for <span className="text-[#e8e4dc]">{forgotEmail}</span></p>
              </div>
              <div className="space-y-3">
                <input
                  type="password"
                  placeholder="New Password"
                  className="figma-input"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  className="figma-input"
                  value={resetPasswordConfirm}
                  onChange={e => setResetPasswordConfirm(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="figma-btn"
              >
                {authLoading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button type="button" onClick={() => { setAuthStep('auth'); setIsAuthMode('login'); }} className="text-xs text-[#c4b998]/60 hover:text-[#c4b998] transition-colors">
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const currentAgent = agents.find(a => a.id === (activeSession?.agentId || selectedAgentId));

  return (
    <div className="min-h-screen figma-bg flex flex-col text-[#e8e4dc] pb-32 md:pb-0 relative overflow-x-hidden">
      <AbstractBackground />
      {/* Desktop Sidebar + Top Bar */}
      <Navbar
        currentUser={currentUser}
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setSelectedAgentId={setSelectedAgentId}
        onLogout={() => setCurrentUser(null)}
      />

      <main className="flex-1 overflow-y-auto pb-32 md:pl-[72px]">
        {activeScreen === 'home' && (
          <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {!selectedAgentId ? (
              <div className="space-y-8">
                {/* Hero welcome card */}
                <div className="figma-glass-blue p-8 md:p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#c4b998]/[0.06] rounded-full blur-[80px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-white/40 text-sm font-medium mb-1">Welcome back,</p>
                    <h2 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] tracking-tight">{currentUser?.name || 'Learner'}</h2>
                    <p className="text-white/40 text-sm mt-2">Continue where you left off.</p>
                  </div>
                  <div className="relative z-10 flex items-center gap-6 mt-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-[#e8e4dc]">{agents.length}</p>
                      <p className="text-[10px] text-white/30 font-medium mt-0.5">Courses</p>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-[#e8e4dc]">
                        {agents.length > 0 ? Math.round(agents.reduce((sum, a) => sum + a.progress, 0) / agents.length) : 0}%
                      </p>
                      <p className="text-[10px] text-white/30 font-medium mt-0.5">Avg Progress</p>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-[#e8e4dc]">
                        {agents.reduce((sum, a) => sum + a.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => s.is_completed && !s.is_review).length, 0), 0)}
                      </p>
                      <p className="text-[10px] text-white/30 font-medium mt-0.5">Completed</p>
                    </div>
                  </div>
                </div>

                {/* Subject header row */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#e8e4dc]">My Courses</h3>
                  <button onClick={() => setIsAgentModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-[#c4b998]/10 hover:-translate-y-0.5 transition-all">
                    <Plus size={16} /> New Course
                  </button>
                </div>

                {/* Subject cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {agents.map(agent => {
                    const totalLessons = agent.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => !s.is_review).length, 0);
                    const completedLessons = agent.roadmap.reduce((acc, m) => acc + m.subtopics.filter(s => s.is_completed && !s.is_review).length, 0);
                    return (
                      <div key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className="group figma-glass p-6 transition-all cursor-pointer hover:bg-white/[0.06] hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 relative">
                        {/* Delete button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteAgent(agent.id); }}
                          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-transparent hover:bg-rose-500/15 flex items-center justify-center text-white/15 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete subject"
                        >
                          <Trash2 size={14} />
                        </button>

                        {/* Subject icon */}
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-lg font-bold text-[#c4b998] mb-5 group-hover:bg-[#c4b998]/10 group-hover:border-[#c4b998]/20 transition-all">
                          {agent.subject[0]}
                        </div>

                        <h3 className="text-base font-bold text-[#e8e4dc] mb-1">{agent.subject}</h3>
                        <p className="text-xs text-white/30 mb-5">{agent.timeframe} &middot; {totalLessons} lessons</p>

                        {/* Progress bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${agent.progress}%`,
                                background: agent.progress === 100 ? 'linear-gradient(90deg, #8baa6e, #a8c98a)' : 'linear-gradient(90deg, #c4b998, #d4c9a8)'
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-white/40 min-w-[36px] text-right">{agent.progress}%</span>
                        </div>

                        {/* Lessons completed */}
                        <p className="text-[10px] text-white/20 mt-3">{completedLessons}/{totalLessons} completed</p>
                      </div>
                    );
                  })}
                  {agents.length === 0 && (
                    <div className="md:col-span-3 py-20 flex flex-col items-center justify-center border border-dashed rounded-2xl border-white/10 text-white/30 bg-white/[0.02]">
                       <Plus size={32} className="mb-3 text-white/15" />
                       <p className="text-sm font-medium">No courses yet. Add your first one!</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-8 pb-24">
                <button onClick={() => setSelectedAgentId(null)} className="text-xs font-medium text-white/40 hover:text-[#e8e4dc] hover:-translate-x-1 transition-all inline-flex items-center gap-1.5">
                  <span className="text-base leading-none">←</span> Back to Courses
                </button>

                {/* Subject Header */}
                <div className="figma-glass-blue p-8 md:p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-72 h-72 bg-[#c4b998]/[0.04] blur-[80px] rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none" />
                  <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Learning Roadmap</p>
                      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#e8e4dc]">{currentAgent?.subject}</h2>
                      <p className="text-white/30 font-medium text-sm mt-2">Personalized by SmartLearn AI</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-3xl font-bold text-[#e8e4dc]">{currentAgent?.progress}%</p>
                        <p className="text-[10px] font-medium text-white/30">Progress</p>
                      </div>
                      {currentAgent?.progress === 100 && (
                        <div className="px-4 py-2.5 bg-[#8baa6e]/15 rounded-xl flex items-center gap-2 border border-[#8baa6e]/20">
                          <Sparkles className="text-[#8baa6e]" size={16}/>
                          <span className="text-[10px] font-semibold text-[#8baa6e]">Ready for Final</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-10">
                   {(() => {
                     const allSubs = currentAgent?.roadmap.flatMap(m => m.subtopics) || [];
                     const uncompletedDays = allSubs.filter(s => !s.is_completed && !s.is_review).map(s => s.day_number);
                     const currentDay = uncompletedDays.length > 0 ? Math.min(...uncompletedDays) : Infinity;
                     const uniqueDays = [...new Set(allSubs.filter(s => !s.is_review).map(s => s.day_number))].sort((a, b) => a - b);
                     const dayLabel = (d: number) => {
                       const idx = uniqueDays.indexOf(d);
                       return idx >= 0 ? idx + 1 : d;
                     };

                     return currentAgent?.roadmap.map((mod) => {
                       const coreSubs = mod.subtopics.filter(s => !s.is_review);
                       const modCompleted = coreSubs.filter(s => s.is_completed).length;
                       const modTotal = coreSubs.length;
                       const modPct = modTotal > 0 ? Math.round((modCompleted / modTotal) * 100) : 0;
                       const isModuleDone = modPct === 100;

                       return (
                         <div key={mod.id} className="space-y-5">
                            {/* Module header */}
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border ${
                                isModuleDone
                                  ? 'bg-[#8baa6e]/15 border-[#8baa6e]/20 text-[#8baa6e]'
                                  : 'bg-white/[0.05] border-white/[0.08] text-white/50'
                              }`}>
                                {isModuleDone ? <CheckCircle2 size={18} /> : (currentAgent!.roadmap.indexOf(mod) + 1)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-lg text-[#e8e4dc] truncate">{mod.title}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <div className="flex-1 max-w-[180px] bg-white/[0.06] h-1 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{
                                      width: `${modPct}%`,
                                      background: isModuleDone ? 'linear-gradient(90deg, #8baa6e, #a8c98a)' : 'linear-gradient(90deg, #c4b998, #d4c9a8)'
                                    }} />
                                  </div>
                                  <span className="text-[10px] font-medium text-white/30">{modCompleted}/{modTotal}</span>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               {mod.subtopics.map(sub => {
                                 const isToday = !sub.is_completed && !sub.is_review && sub.day_number === currentDay;
                                 const isLocked = !sub.is_completed && !sub.is_review && sub.day_number > currentDay;
                                 const isAccessible = sub.is_completed || sub.is_review || sub.day_number <= currentDay;

                                 return (
                                   <div
                                     key={sub.id}
                                     onClick={() => { if (isAccessible) setActiveSession({ agentId: selectedAgentId!, subtopic: sub }); }}
                                     className={`group relative p-5 rounded-2xl border transition-all duration-200 overflow-hidden ${
                                       isLocked
                                         ? 'bg-white/[0.02] border-white/[0.05] cursor-not-allowed'
                                         : sub.is_review
                                           ? 'figma-glass border-amber-500/15 hover:border-amber-500/30 cursor-pointer hover:-translate-y-0.5'
                                           : sub.is_completed
                                             ? 'figma-glass border-[#8baa6e]/20 hover:border-[#8baa6e]/40 cursor-pointer hover:-translate-y-0.5'
                                             : isToday
                                               ? 'figma-glass border-[#c4b998]/30 cursor-pointer hover:-translate-y-0.5 shadow-lg shadow-[#c4b998]/[0.03]'
                                               : 'figma-glass hover:border-white/15 cursor-pointer hover:-translate-y-0.5'
                                     }`}
                                   >
                                      {/* Today indicator dot */}
                                      {isToday && (
                                        <div className="absolute top-3 right-3 w-2 h-2">
                                          <span className="absolute inset-0 rounded-full bg-[#c4b998] animate-ping opacity-50" />
                                          <span className="absolute inset-0 rounded-full bg-[#c4b998]" />
                                        </div>
                                      )}

                                      <div className={`${isLocked ? 'opacity-30' : ''}`}>
                                        <div className="flex justify-between items-center mb-4">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                                              sub.is_review
                                                ? 'bg-amber-500/10 text-amber-400/80 border border-amber-500/15'
                                                : sub.is_completed
                                                  ? 'bg-[#8baa6e]/10 text-[#8baa6e] border border-[#8baa6e]/15'
                                                  : isToday
                                                    ? 'bg-[#c4b998]/10 text-[#c4b998] border border-[#c4b998]/20'
                                                    : isLocked
                                                      ? 'bg-white/[0.03] text-white/20 border border-white/[0.05]'
                                                      : 'bg-white/[0.05] text-white/50 border border-white/[0.08]'
                                            }`}>
                                              {sub.is_review ? 'Review' : `Day ${dayLabel(sub.day_number)}`}
                                            </span>
                                            {isToday && (
                                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-[#c4b998]/10 text-[#c4b998] border border-[#c4b998]/15">
                                                Today
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {typeof sub.quiz_score === 'number' && (
                                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                                sub.quiz_score >= 70
                                                  ? 'bg-[#8baa6e]/10 text-[#8baa6e] border border-[#8baa6e]/15'
                                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/15'
                                              }`}>{sub.quiz_score}%</span>
                                            )}
                                            {isLocked
                                              ? <Lock size={13} className="text-white/15" />
                                              : <span className="text-[9px] font-medium text-white/25">{sub.difficulty}</span>
                                            }
                                          </div>
                                        </div>
                                        <h5 className={`font-semibold text-[15px] leading-snug ${isLocked ? 'text-white/20' : 'text-[#e8e4dc]'}`}>{sub.title}</h5>
                                        {sub.is_review && sub.weak_concepts && sub.weak_concepts.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                                            {sub.weak_concepts.slice(0, 3).map((c, i) => (
                                              <span key={i} className="text-[9px] font-medium bg-amber-500/8 text-amber-400/70 px-2 py-0.5 rounded-md border border-amber-500/10">{c.length > 30 ? c.slice(0, 30) + '...' : c}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className={`mt-4 pt-3 border-t text-[10px] font-semibold ${isLocked ? 'border-white/[0.03]' : 'border-white/[0.06]'}`}>
                                        {sub.is_completed ? (
                                          <span className="text-[#8baa6e] flex items-center gap-1.5">
                                            <CheckCircle2 size={12} /> Completed
                                          </span>
                                        ) : isLocked ? (
                                          <span className="text-white/15 flex items-center gap-1.5">
                                            <Lock size={12} /> Locked
                                          </span>
                                        ) : sub.is_review ? (
                                          <div className="flex items-center justify-between w-full">
                                            <span className="text-amber-400/70 group-hover:text-amber-300 transition-colors">Start Review →</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const btn = e.currentTarget;
                                                if (btn.dataset.clicked) return;
                                                btn.dataset.clicked = 'true';
                                                handleMarkReviewRead(selectedAgentId!, sub.id);
                                              }}
                                              className="text-[10px] font-semibold text-white/30 hover:text-[#8baa6e] transition-colors px-2.5 py-1 rounded-lg hover:bg-[#8baa6e]/10 border border-transparent hover:border-[#8baa6e]/20"
                                            >
                                              Mark as Read
                                            </button>
                                          </div>
                                        ) : isToday ? (
                                          <span className="text-[#c4b998] group-hover:text-[#e8e4dc] transition-colors">Start Today's Lesson →</span>
                                        ) : (
                                          <span className="text-white/40 group-hover:text-[#e8e4dc] transition-colors">Start Lesson →</span>
                                        )}
                                      </div>
                                   </div>
                                 );
                               })}
                            </div>
                         </div>
                       );
                     });
                   })()}

                   {/* Final Assessment Section */}
                   <div className="pt-12 border-t border-white/[0.06] text-center space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-[#c4b998] to-[#a89870] text-[#111113] rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-[#c4b998]/10">
                        <Trophy size={28}/>
                      </div>
                      <div className="max-w-md mx-auto">
                        <h4 className="text-2xl font-bold tracking-tight text-[#e8e4dc]">Final Assessment</h4>
                        <p className="text-white/30 font-medium text-sm mt-2">Validate your understanding with a 30-question challenge.</p>
                      </div>

                      {currentAgent?.final_assessment?.is_completed ? (
                        <div className="figma-glass-blue p-8 border border-[#c4b998]/15 animate-in zoom-in-95">
                          <p className="text-[10px] font-semibold text-[#c4b998] mb-2">Assessment Results</p>
                          <p className="text-5xl font-bold text-[#e8e4dc] mb-5">{currentAgent.final_assessment.score}%</p>
                          <div className="text-left space-y-3">
                             <p className="text-sm font-medium text-white/50 italic leading-relaxed">"{currentAgent.final_assessment.feedback}"</p>
                             <button onClick={() => setIsFinalAssessmentOpen(true)} className="text-[10px] font-semibold text-[#c4b998] hover:text-[#e8e4dc] underline transition-colors">Retake</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsFinalAssessmentOpen(true)}
                          className={`w-full max-w-md py-5 rounded-xl font-bold text-sm transition-all duration-200 ${
                            currentAgent?.progress === 100
                              ? 'bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] hover:shadow-lg hover:shadow-[#c4b998]/10 hover:-translate-y-0.5'
                              : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.06]'
                          }`}
                          disabled={currentAgent?.progress !== 100}
                        >
                          {currentAgent?.progress === 100 ? 'Start Final Assessment' : `Complete All Lessons (${currentAgent?.progress}%)`}
                        </button>
                      )}
                      {currentAgent?.progress !== 100 && (
                        <p className="text-[10px] font-medium text-white/20">Unlocks at 100% completion.</p>
                      )}
                   </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeScreen === 'planner' && <Planner tasks={tasks} schedule={schedule} agents={agents} currentUser={currentUser} onStartSession={handleStartSessionFromPlanner} onUpdateSchedule={(updated) => { setSchedule(updated); if (currentUser) firebaseService.saveSchedule(currentUser.uid, updated); }} onUpdateTasks={(updated) => setTasks(updated)} />}
        {activeScreen === 'stats' && <Dashboard agents={agents} />}

        {activeScreen === 'me' && (
          <Profile
            user={currentUser}
            agents={agents}
            onLogout={() => setCurrentUser(null)}
            onUpdateUser={(u) => setCurrentUser(u)}
          />
        )}
      </main>

      <nav className="md:hidden fixed bottom-4 inset-x-4 sm:inset-x-8 bg-[#1a1a1e]/90 backdrop-blur-2xl rounded-2xl h-[68px] flex items-center justify-around px-2 z-50 border border-white/[0.06] shadow-2xl shadow-black/40">
        {[
          { id: 'home', label: 'Courses', icon: Home },
          { id: 'planner', label: 'Schedule', icon: Calendar },
          { id: 'stats', label: 'Analytics', icon: Zap },
          { id: 'me', label: 'Profile', icon: UserIcon }
        ].map(n => (
          <button key={n.id} onClick={() => { setActiveScreen(n.id as any); setSelectedAgentId(null); }} className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${activeScreen === n.id ? 'text-[#c4b998]' : 'text-white/30 hover:text-white/50'}`}>
            {activeScreen === n.id && (
              <span className="absolute inset-0 bg-[#c4b998]/8 rounded-xl -z-10 border border-[#c4b998]/10"></span>
            )}
            <n.icon size={20} className="mb-0.5" />
            <span className={`text-[8px] font-semibold transition-all ${activeScreen === n.id ? 'opacity-100 text-[#c4b998]' : 'opacity-0 h-0 overflow-hidden'}`}>{n.label}</span>
          </button>
        ))}
      </nav>

      {isAgentModalOpen && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-[#1a1a1e] figma-scrollbar rounded-2xl p-7 sm:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto border border-white/[0.08]">
              <div className="mb-6">
                 <h2 className="text-2xl font-bold tracking-tight text-[#e8e4dc]">New Course</h2>
                 <p className="text-sm font-medium text-white/30 mt-1">AI will generate a personalized roadmap for you.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Subject Name</label>
                  <input type="text" placeholder="e.g. Calculus, SEO, Quantum Computing" className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium focus:border-[#c4b998]/40 transition-all text-[#e8e4dc] placeholder:text-white/20 text-sm" value={newAgent.name} onChange={e => setNewAgent({...newAgent, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Syllabus / Key Topics</label>
                  <textarea rows={3} placeholder="Paste your syllabus or list key topics..." className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-sm resize-none focus:border-[#c4b998]/40 transition-all text-[#e8e4dc] placeholder:text-white/20" value={newAgent.syllabus} onChange={e => setNewAgent({...newAgent, syllabus: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Duration</label>
                    <input type="number" min="1" className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-[#e8e4dc] focus:border-[#c4b998]/40 transition-all text-sm" value={timeframeValue} onChange={e => setTimeframeValue(parseInt(e.target.value) || 1)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Unit</label>
                    <select className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-[#e8e4dc] focus:border-[#c4b998]/40 transition-all text-sm" value={timeframeUnit} onChange={e => setTimeframeUnit(e.target.value)}>
                      <option className="bg-[#1a1a1e]" value="day">Day(s)</option>
                      <option className="bg-[#1a1a1e]" value="week">Week(s)</option>
                      <option className="bg-[#1a1a1e]" value="month">Month(s)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Difficulty</label>
                    <select className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-sm text-[#e8e4dc] focus:border-[#c4b998]/40 transition-all" value={difficultyLevel} onChange={e => setDifficultyLevel(e.target.value)}>
                      <option className="bg-[#1a1a1e]" value="Beginner">Beginner</option>
                      <option className="bg-[#1a1a1e]" value="Intermediate">Intermediate</option>
                      <option className="bg-[#1a1a1e]" value="Advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Learning Style</label>
                    <select className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-sm text-[#e8e4dc] focus:border-[#c4b998]/40 transition-all" value={learningStyle} onChange={e => setLearningStyle(e.target.value)}>
                      <option className="bg-[#1a1a1e]" value="Theoretical">Theoretical</option>
                      <option className="bg-[#1a1a1e]" value="Practical">Practical</option>
                      <option className="bg-[#1a1a1e]" value="Fast-paced">Fast-paced</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Daily Hours</label>
                    <input type="number" min="1" max="12" className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-[#e8e4dc] focus:border-[#c4b998]/40 transition-all text-sm" value={dailyHours} onChange={e => setDailyHours(parseInt(e.target.value) || 1)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 ml-1 mb-1.5 block">Textbook (Optional)</label>
                    <input type="text" placeholder="e.g. CLRS, Thomas Calc" className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] outline-none font-medium text-sm focus:border-[#c4b998]/40 transition-all text-[#e8e4dc] placeholder:text-white/20" value={referenceTextbook} onChange={e => setReferenceTextbook(e.target.value)} />
                  </div>
                </div>
                <div className="pt-3">
                  <button disabled={loading} onClick={handleCreateAgent} className="w-full py-4 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-bold text-sm shadow-lg shadow-[#c4b998]/10 hover:shadow-[#c4b998]/20 disabled:opacity-50 transition-all">
                    {loading ? 'Generating Roadmap...' : 'Generate Roadmap'}
                  </button>
                  <button onClick={() => setIsAgentModalOpen(false)} className="w-full mt-3 text-xs font-medium text-white/30 hover:text-white/60 transition-colors py-2">Cancel</button>
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
