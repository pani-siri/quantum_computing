
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, LearningAgent, Task, ScheduleEvent, SubTopic, Difficulty, ChatMessage, AcademicBundle, Module, CognitiveLoadState, MasteryState } from './types';
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
import { Trophy, Sparkles, Home, Calendar, Zap, User as UserIcon, Lock, CheckCircle2, Trash2 } from 'lucide-react';

const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<'home' | 'planner' | 'stats' | 'about' | 'me'>('home');
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
          ? { ...s, is_completed: true, is_synthesized: true, bundle: stats.bundle, quiz_score: quizScore ?? undefined, weak_concepts: weakConcepts.length ? weakConcepts : undefined }
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
                    <div key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className="group figma-glass p-8 transition-all cursor-pointer hover:-translate-y-1 relative">
                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteAgent(agent.id); }}
                        className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/0 hover:bg-rose-500/20 flex items-center justify-center text-white/20 hover:text-rose-300 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-400/30"
                        title="Delete subject"
                      >
                        <Trash2 size={16} />
                      </button>
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
                <button onClick={() => setSelectedAgentId(null)} className="text-xs font-bold text-indigo-200 hover:text-white hover:-translate-x-1 transition-all inline-flex items-center gap-1">
                  <span className="text-lg leading-none">←</span> Back to Subjects
                </button>

                {/* Subject Header */}
                <div className="figma-glass-blue p-10 md:p-12 rounded-[3rem] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                  <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200/70 mb-2">Learning Roadmap</p>
                      <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">{currentAgent?.subject}</h2>
                      <p className="text-white/50 font-bold text-sm mt-2">Daily Roadmap Optimized by SmartLearn AI</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-4xl font-black text-white">{currentAgent?.progress}%</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-200/60">Progress</p>
                      </div>
                      {currentAgent?.progress === 100 && (
                        <div className="px-5 py-3 bg-emerald-500/20 backdrop-blur-md rounded-2xl flex items-center gap-2 border border-emerald-400/30">
                          <Sparkles className="text-emerald-300" size={18}/>
                          <span className="text-[10px] font-black text-emerald-200 uppercase tracking-widest">Ready for Final</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-14">
                   {(() => {
                     // Determine the current active day: smallest day_number among uncompleted non-review subtopics
                     const allSubs = currentAgent?.roadmap.flatMap(m => m.subtopics) || [];
                     const uncompletedDays = allSubs.filter(s => !s.is_completed && !s.is_review).map(s => s.day_number);
                     const currentDay = uncompletedDays.length > 0 ? Math.min(...uncompletedDays) : Infinity;
                     // Assign a global sequential index to each unique day_number for display
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
                         <div key={mod.id} className="space-y-6">
                            {/* Module header with progress */}
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black border ${
                                isModuleDone
                                  ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                                  : 'bg-white/10 border-white/20 text-white/70'
                              }`}>
                                {isModuleDone ? <CheckCircle2 size={20} /> : (currentAgent!.roadmap.indexOf(mod) + 1)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-black text-xl text-white truncate">{mod.title}</h4>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <div className="flex-1 max-w-[200px] bg-white/10 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{
                                      width: `${modPct}%`,
                                      background: isModuleDone ? 'linear-gradient(90deg, #34d399, #6ee7b7)' : 'linear-gradient(90deg, #818cf8, #a78bfa)'
                                    }} />
                                  </div>
                                  <span className="text-[10px] font-black text-white/40">{modCompleted}/{modTotal}</span>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                               {mod.subtopics.map(sub => {
                                 const isToday = !sub.is_completed && !sub.is_review && sub.day_number === currentDay;
                                 const isLocked = !sub.is_completed && !sub.is_review && sub.day_number > currentDay;
                                 const isAccessible = sub.is_completed || sub.is_review || sub.day_number <= currentDay;

                                 return (
                                   <div
                                     key={sub.id}
                                     onClick={() => { if (isAccessible) setActiveSession({ agentId: selectedAgentId!, subtopic: sub }); }}
                                     className={`group relative p-6 rounded-[2rem] border transition-all duration-300 overflow-hidden ${
                                       isLocked
                                         ? 'bg-white/[0.03] border-white/[0.08] cursor-not-allowed'
                                         : sub.is_review
                                           ? 'figma-glass border-amber-400/30 hover:border-amber-400/60 cursor-pointer hover:-translate-y-1 hover:shadow-xl'
                                           : sub.is_completed
                                             ? 'figma-glass border-emerald-400/30 hover:border-emerald-400/60 cursor-pointer hover:-translate-y-1 hover:shadow-xl'
                                             : isToday
                                               ? 'figma-glass border-indigo-400/50 cursor-pointer hover:-translate-y-1 hover:shadow-xl shadow-lg shadow-indigo-500/10'
                                               : 'figma-glass border-white/20 hover:border-indigo-400/50 cursor-pointer hover:-translate-y-1 hover:shadow-xl'
                                     }`}
                                   >
                                      {/* Today pulse ring */}
                                      {isToday && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3">
                                          <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-75" />
                                          <span className="absolute inset-0 rounded-full bg-indigo-400" />
                                        </div>
                                      )}

                                      {/* Hover glow */}
                                      {!isLocked && (
                                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${
                                          sub.is_review ? 'bg-gradient-to-br from-amber-500/10 to-transparent'
                                          : sub.is_completed ? 'bg-gradient-to-br from-emerald-500/10 to-transparent'
                                          : 'bg-gradient-to-br from-indigo-500/10 to-transparent'
                                        }`} />
                                      )}

                                      <div className={`relative z-10 ${isLocked ? 'opacity-40' : ''}`}>
                                        <div className="flex justify-between items-center mb-5">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg ${
                                              sub.is_review
                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                                : sub.is_completed
                                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                                  : isToday
                                                    ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/40'
                                                    : isLocked
                                                      ? 'bg-white/5 text-white/30 border border-white/10'
                                                      : 'bg-white/10 text-white/80 border border-white/20'
                                            }`}>
                                              {sub.is_review ? 'Review' : `Day ${dayLabel(sub.day_number)}`}
                                            </span>
                                            {isToday && (
                                              <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-widest">
                                                Today
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {typeof sub.quiz_score === 'number' && (
                                              <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg ${
                                                sub.quiz_score >= 70
                                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                                              }`}>{sub.quiz_score}%</span>
                                            )}
                                            {isLocked
                                              ? <Lock size={14} className="text-white/20" />
                                              : <span className="text-[9px] font-bold text-white/40 uppercase">{sub.difficulty}</span>
                                            }
                                          </div>
                                        </div>
                                        <h5 className={`font-black text-lg leading-snug ${isLocked ? 'text-white/30' : 'text-white'}`}>{sub.title}</h5>
                                        {sub.is_review && sub.weak_concepts && sub.weak_concepts.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mt-3">
                                            {sub.weak_concepts.slice(0, 3).map((c, i) => (
                                              <span key={i} className="text-[9px] font-bold bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/20">{c.length > 30 ? c.slice(0, 30) + '...' : c}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className={`relative z-10 mt-6 pt-4 border-t text-[10px] font-black uppercase tracking-widest ${isLocked ? 'border-white/5' : 'border-white/10'}`}>
                                        {sub.is_completed ? (
                                          <span className="text-emerald-400 flex items-center gap-1.5">
                                            <CheckCircle2 size={12} /> Completed
                                          </span>
                                        ) : isLocked ? (
                                          <span className="text-white/20 flex items-center gap-1.5">
                                            <Lock size={12} /> Locked
                                          </span>
                                        ) : sub.is_review ? (
                                          <div className="flex items-center justify-between w-full">
                                            <span className="text-amber-400 group-hover:text-amber-300 transition-colors">Start Review →</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const btn = e.currentTarget;
                                                if (btn.dataset.clicked) return;
                                                btn.dataset.clicked = 'true';
                                                handleMarkReviewRead(selectedAgentId!, sub.id);
                                              }}
                                              className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 border border-transparent hover:border-emerald-400/30"
                                            >
                                              Mark as Read
                                            </button>
                                          </div>
                                        ) : isToday ? (
                                          <span className="text-indigo-300 group-hover:text-white transition-colors">Start Today's Lesson →</span>
                                        ) : (
                                          <span className="text-indigo-300 group-hover:text-white transition-colors">Start Adaptive Lesson →</span>
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
                   <div className="pt-16 border-t border-white/10 text-center space-y-8">
                      <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl shadow-indigo-500/30 border border-white/20">
                        <Trophy size={32}/>
                      </div>
                      <div className="max-w-md mx-auto">
                        <h4 className="text-3xl font-black italic tracking-tight text-white">Course Mastery Terminal</h4>
                        <p className="text-white/50 font-bold text-sm mt-2">Validate your total understanding with a rigorous 30-question final challenge.</p>
                      </div>

                      {currentAgent?.final_assessment?.is_completed ? (
                        <div className="figma-glass-blue p-10 rounded-[3rem] border border-indigo-400/30 animate-in zoom-in-95">
                          <p className="text-[10px] font-black uppercase text-indigo-300 tracking-widest mb-2">Assessment Results</p>
                          <p className="text-6xl font-black italic text-white mb-6">{currentAgent.final_assessment.score}%</p>
                          <div className="text-left space-y-4">
                             <p className="text-sm font-bold text-indigo-100 italic leading-relaxed">"{currentAgent.final_assessment.feedback}"</p>
                             <button onClick={() => setIsFinalAssessmentOpen(true)} className="text-[10px] font-black uppercase text-indigo-300 hover:text-white underline transition-colors">Retake Mastery Challenge</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsFinalAssessmentOpen(true)}
                          className={`w-full max-w-md py-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl transition-all duration-300 ${
                            currentAgent?.progress === 100
                              ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:shadow-indigo-500/40 hover:-translate-y-1 border border-white/20'
                              : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
                          }`}
                          disabled={currentAgent?.progress !== 100}
                        >
                          {currentAgent?.progress === 100 ? 'Launch Final Mastery Challenge' : `Complete All Lessons (${currentAgent?.progress}%)`}
                        </button>
                      )}
                      {currentAgent?.progress !== 100 && (
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Mastery node unlocks at 100% roadmap completion.</p>
                      )}
                   </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeScreen === 'planner' && <Planner tasks={tasks} schedule={schedule} agents={agents} currentUser={currentUser} onStartSession={handleStartSessionFromPlanner} onUpdateSchedule={(updated) => { setSchedule(updated); if (currentUser) firebaseService.saveSchedule(currentUser.uid, updated); }} />}
        {activeScreen === 'stats' && <Dashboard agents={agents} />}
        {activeScreen === 'about' && <About />}
        {activeScreen === 'me' && (
          <Profile
            user={currentUser}
            agents={agents}
            onLogout={() => setCurrentUser(null)}
            onUpdateUser={(u) => setCurrentUser(u)}
          />
        )}
      </main>

      <nav className="md:hidden fixed bottom-6 inset-x-4 sm:inset-x-10 figma-glass rounded-[2.5rem] h-[84px] flex items-center justify-between px-4 sm:px-8 z-50 shadow-2xl">
        {[
          { id: 'home', label: 'Subjects', icon: Home },
          { id: 'planner', label: 'Schedule', icon: Calendar },
          { id: 'stats', label: 'Velocity', icon: Zap },
          { id: 'me', label: 'Profile', icon: UserIcon },
          { id: 'about', label: 'About', icon: Sparkles }
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
