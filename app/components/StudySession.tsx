
import React, { useState, useEffect, useRef } from 'react';
import { SubTopic, MasteryState, ChatMessage, LearningAgent, AcademicBundle, CognitiveLoadState, QuizItem, BehavioralMetrics } from '../types';
import { fastapiService } from '../services/fastapiService';
import { extractNotesFeatures, extractQuizFeatures, extractVideoFeatures } from '../services/qsvmFeatureExtractor';
import { ExternalLink, Youtube, FileText, BookOpen, GraduationCap, CheckCircle2, FileSearch, LibraryBig, Sparkles, Layers, AlertTriangle, Clock } from 'lucide-react';
import { detectFace, preloadModel, type FaceDetectionResult } from '../services/faceDetector';

interface StudySessionProps {
  subtopic: SubTopic;
  agent: LearningAgent;
  onComplete: (stats: { focusTime: number, distractions: number, bundle: AcademicBundle, loadState: CognitiveLoadState, quizScore?: number, wrongAnswers?: string[], behavioral_metrics?: BehavioralMetrics }) => void;
  onExit: () => void;
  onUpdateChat: (messages: ChatMessage[]) => void;
}

const StudySession: React.FC<StudySessionProps> = ({ subtopic, agent, onComplete, onExit, onUpdateChat }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'notes' | 'materials' | 'flashcards' | 'quiz' | 'chat'>('video');
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  // timeSpent is only needed at finalization — keep as ref to avoid 1 re-render/sec
  const timeSpentRef = useRef(0);
  const [focusTime, setFocusTime] = useState(0);
  const [distractions, setDistractions] = useState(0);
  
  const [isSynthesizing, setIsSynthesizing] = useState(!subtopic.is_synthesized);
  const [bundle, setBundle] = useState<AcademicBundle | undefined>(subtopic.bundle);
  
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Quiz State
  const [quizStarted, setQuizStarted] = useState(false);
  const [activeQuizSet, setActiveQuizSet] = useState<QuizItem[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const regenCooldownRef = useRef<Record<string, number>>({});
  const quizWrongStreakRef = useRef(0);
  const quizWrongAnswersRef = useRef<string[]>([]);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const notesSectionsRef = useRef<string[]>([]);
  const activeNotesSectionRef = useRef<number>(0);
  const notesSectionSecondsRef = useRef<Record<number, number>>({});
  const notesSectionScrollEventsRef = useRef<Record<number, number>>({});

  const quizQuestionStartAtRef = useRef<number>(Date.now());
  const quizRetriesRef = useRef<number>(0);

  const videoTabSecondsRef = useRef(0);
  const videoClicksRef = useRef<Record<number, number>>({});

  const timerRef = useRef<any>(null);

  // Webcam & Face Detection
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const faceCheckRef = useRef<any>(null);
  const [showFaceWarning, setShowFaceWarning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const faceWarningTimeoutRef = useRef<any>(null);
  const consecutiveMissRef = useRef(0);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  const [sessionStarted, setSessionStarted] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 160 }, height: { ideal: 160 }, facingMode: 'user' } });
      webcamStreamRef.current = stream;
      setCameraActive(true);
      setCameraError(false);
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        webcamVideoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('[CAMERA] Failed:', err);
      setCameraActive(false);
      setCameraError(true);
    }
  };

  const stopCamera = () => {
    if (faceCheckRef.current) clearInterval(faceCheckRef.current);
    if (faceWarningTimeoutRef.current) clearTimeout(faceWarningTimeoutRef.current);
    webcamStreamRef.current?.getTracks().forEach(t => t.stop());
    webcamStreamRef.current = null;
    if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
    setCameraActive(false);
    setShowFaceWarning(false);
    consecutiveMissRef.current = 0;
  };

  // Called on user click — enters fullscreen (user gesture required)
  // Camera is only started when the quiz tab is opened
  const handleStartSession = async () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setSessionStarted(true);
  };

  // Ref callback — attaches stream to video element whenever it mounts
  const webcamRefCallback = (el: HTMLVideoElement | null) => {
    webcamVideoRef.current = el;
    if (el && webcamStreamRef.current) {
      el.srcObject = webcamStreamRef.current;
      el.play().catch(() => {});
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webcamStreamRef.current?.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
      document.exitFullscreen?.().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Face detection loop — ONLY active during 'quiz' tab
  // Uses Ultra-Light-Fast-Generic-Face-Detector-1MB (ONNX) for accurate presence detection
  useEffect(() => {
    if (!cameraActive || activeTab !== 'quiz') {
      if (faceCheckRef.current) clearInterval(faceCheckRef.current);
      if (faceWarningTimeoutRef.current) clearTimeout(faceWarningTimeoutRef.current);
      setShowFaceWarning(false);
      consecutiveMissRef.current = 0;
      return;
    }

    faceCheckRef.current = setInterval(async () => {
      const video = webcamVideoRef.current;
      if (!video || video.readyState < 2) return;

      const result: FaceDetectionResult = await detectFace(video);

      if (!result.faceDetected) {
        consecutiveMissRef.current += 1;
        if (consecutiveMissRef.current >= 2) {
          setShowFaceWarning(true);
          setDistractions(d => d + 1);
          clearTimeout(faceWarningTimeoutRef.current);
          faceWarningTimeoutRef.current = setTimeout(() => setShowFaceWarning(false), 5000);
        }
      } else {
        consecutiveMissRef.current = 0;
        setShowFaceWarning(false);
      }
    }, 3000);

    return () => {
      if (faceCheckRef.current) clearInterval(faceCheckRef.current);
      if (faceWarningTimeoutRef.current) clearTimeout(faceWarningTimeoutRef.current);
    };
  }, [cameraActive, activeTab]);

  // Camera lifecycle: ON only during quiz tab, OFF everywhere else
  // Also preload the ONNX face detector model so it's ready before the first check fires
  useEffect(() => {
    if (activeTab === 'quiz') {
      preloadModel(); // warm up ONNX runtime + model in background
      if (!cameraActive && !cameraError) startCamera();
    } else {
      if (cameraActive) stopCamera();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const synthesizeNode = async () => {
    setIsSynthesizing(true);
    const lastLoad = agent.cognitive_history.length > 0 
      ? agent.cognitive_history[agent.cognitive_history.length - 1].state 
      : CognitiveLoadState.OPTIMAL;

    try {
      const result = await fastapiService.synthesizeContent(agent.subject, subtopic.title, lastLoad, agent.user_id, subtopic.weak_concepts);
      setBundle(result.bundle);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  useEffect(() => {
    if (sessionStarted && (!subtopic.is_synthesized || !bundle)) synthesizeNode();
  }, [subtopic.id, sessionStarted]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      timeSpentRef.current += 1;
      if (document.hasFocus()) setFocusTime(f => f + 1);
    }, 1000);

    const handleVisibility = () => {
      if (document.hidden) setDistractions(d => d + 1);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: new Date().toISOString() };
    const newHistory = [...agent.chat_history, userMsg];
    onUpdateChat(newHistory);
    setChatInput('');
    setIsTyping(true);
    try {
      const contextChunks: string[] = [];

      if (bundle?.notes) {
        contextChunks.push(`NOTES:\n${bundle.notes}`);
      }

      const context = contextChunks.join('\n\n');

      const response = await fastapiService.getAgentResponse(
        { ...agent, chat_history: newHistory },
        chatInput,
        { subtopicTitle: subtopic.title, context }
      );

      onUpdateChat([...newHistory, response]);
    } catch (err: any) {
      console.error('Tutor chat failed', err);
      const fallback: ChatMessage = {
        role: 'model',
        text: err?.message || 'Tutor is currently unavailable. Please try again in a moment.',
        timestamp: new Date().toISOString()
      };
      onUpdateChat([...newHistory, fallback]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleStartQuiz = () => {
    if (!bundle?.quiz) return;
    const shuffled = [...bundle.quiz].sort(() => 0.5 - Math.random());
    const sliced = shuffled.slice(0, Math.min(10, bundle.quiz.length));
    setActiveQuizSet(sliced);
    setQuizStarted(true);
    quizQuestionStartAtRef.current = Date.now();
    quizRetriesRef.current = 0;
  };

  const isCooldownActive = (key: string, ms: number) => {
    const last = regenCooldownRef.current[key] || 0;
    return Date.now() - last < ms;
  };

  const markCooldown = (key: string) => {
    regenCooldownRef.current[key] = Date.now();
  };

  const simplifyResource = async (args: {
    resourceType: 'notes_snippet' | 'video_item' | 'quiz_item';
    index?: number;
    current?: any;
    cooldownKey: string;
    metrics?: BehavioralMetrics;
  }) => {
    if (!bundle) return;
    if (isRegenerating) return;
    if (isCooldownActive(args.cooldownKey, 45_000)) return;

    setIsRegenerating(true);
    markCooldown(args.cooldownKey);

    try {
      let predictedLoad: CognitiveLoadState = CognitiveLoadState.HIGH;
      if (args.metrics) {
        try {
          const q = await fastapiService.predictQSVM(args.metrics);
          predictedLoad = q.state;
          console.info('[QSVM] predicted', { state: q.state, confidence: q.confidence, resourceType: args.resourceType, index: args.index });
        } catch (e) {
          console.error('QSVM predict failed, falling back to HIGH', e);
        }

        if (predictedLoad !== CognitiveLoadState.HIGH) {
          return;
        }
      }

      const res = await fastapiService.regenerateResource(agent.subject, subtopic.title, {
        resourceType: args.resourceType,
        index: args.index,
        current: args.current,
        cognitiveLoad: predictedLoad,
        userId: agent.user_id,
        extraContext: `User requested simpler version while studying tab=${activeTab}`
      });
      console.info('[AI] regenerated resource', { resourceType: args.resourceType, index: args.index });

      setBundle(prev => {
        if (!prev) return prev;
        const next = { ...prev };

        if (args.resourceType === 'notes_snippet' && typeof args.index === 'number') {
          const sections = notesSectionsRef.current;
          if (sections[args.index] && typeof res.resource?.snippet === 'string') {
            const updated = [...sections];
            updated[args.index] = res.resource.snippet;
            notesSectionsRef.current = updated;
            next.notes = updated.join('\n\n');
          }
        }

        if (args.resourceType === 'quiz_item' && typeof args.index === 'number') {
          if (activeQuizSet[args.index] && res.resource?.question) {
            const updated = [...activeQuizSet];
            updated[args.index] = {
              question: res.resource.question,
              options: res.resource.options,
              answer: res.resource.answer,
              explanation: res.resource.explanation
            };
            setActiveQuizSet(updated);
            setSelectedQuizOption(null);
            setShowAnswer(false);
          }
        }

        if (args.resourceType === 'video_item' && typeof args.index === 'number') {
          const list = Array.isArray(next.videos) ? [...next.videos] : [];
          if (list[args.index] && res.resource?.title && res.resource?.url) {
            list[args.index] = {
              title: res.resource.title,
              url: res.resource.url,
              description: res.resource.description
            };
            next.videos = list;
          }
        }

        return next;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Robust answer matching: handles exact text, letter-only answers (A/B/C/D),
  // letter+period (A.), trimmed whitespace, and case differences.
  const matchesAnswer = (selected: string | null, answer: string, options: string[]): boolean => {
    if (!selected) return false;
    const norm = (s: string) => s.trim().toLowerCase();
    if (norm(selected) === norm(answer)) return true;
    // Answer is a bare letter or letter+punctuation e.g. "A", "B.", "C)"
    const letterOnly = answer.trim().match(/^([A-Da-d])[.):,]?$/);
    if (letterOnly) {
      const idx = letterOnly[1].toUpperCase().charCodeAt(0) - 65;
      return norm(options[idx] ?? '') === norm(selected);
    }
    // Strip any leading "A) " / "A. " prefix from both sides
    const strip = (s: string) => norm(s).replace(/^[a-d][.):\s]+/, '');
    return strip(selected) === strip(answer);
  };

  const finalizeSession = async () => {
    if (isFinalizing || isFinalized) return;
    setIsFinalizing(true);

    const attempts = activeQuizSet.length || 1;
    const accuracy = quizScore / attempts;
    const errorRate = Math.max(0, Math.min(1, 1 - accuracy));
    const metrics: BehavioralMetrics = {
      time_spent: timeSpentRef.current,
      response_time: 0,
      error_rate: errorRate,
      retries: 0,
      interaction_frequency: agent.chat_history.length / Math.max(1, timeSpentRef.current / 60)
    };

    let loadState: CognitiveLoadState = CognitiveLoadState.OPTIMAL;
    try {
      const q = await fastapiService.predictQSVM(metrics);
      loadState = q.state;
    } catch (e) {
      console.error('Final QSVM predict failed, using OPTIMAL', e);
    }

    const quizScorePercent = activeQuizSet.length > 0 ? Math.round((quizScore / activeQuizSet.length) * 100) : undefined;
    setIsFinalized(true);
    onComplete({ focusTime, distractions, bundle: bundle!, loadState, quizScore: quizScorePercent, wrongAnswers: quizWrongAnswersRef.current.length > 0 ? quizWrongAnswersRef.current : undefined, behavioral_metrics: metrics });
  };

  const getEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
    return url;
  };


  useEffect(() => {
    if (!quizStarted) return;
    quizQuestionStartAtRef.current = Date.now();
    quizRetriesRef.current = 0;
  }, [quizStarted, currentQuizIndex]);

  useEffect(() => {
    const t = setInterval(() => {
      if (activeTab === 'video') {
        videoTabSecondsRef.current += 1;
      }
    }, 1000);
    return () => clearInterval(t);
  }, [activeTab]);

  const handleVideoSourceClick = (videoIndex: number) => {
    const clicks = (videoClicksRef.current[videoIndex] || 0) + 1;
    videoClicksRef.current[videoIndex] = clicks;

    const secs = videoTabSecondsRef.current || 0;
    if (secs < 30) return;

    const metrics: BehavioralMetrics = extractVideoFeatures({
      time_spent_sec: secs,
      video_switches: clicks,
      max_expected_switches: 3
    });
    if (!isCooldownActive(`video_auto_${videoIndex}`, 120_000)) {
      markCooldown(`video_auto_${videoIndex}`);
      simplifyResource({
        resourceType: 'video_item',
        index: videoIndex,
        current: bundle?.videos?.[videoIndex],
        cooldownKey: `video_auto_${videoIndex}`,
        metrics
      });
      videoClicksRef.current[videoIndex] = 0;
      videoTabSecondsRef.current = 0;
    }
  };

  const handleMainScroll = () => {
    if (activeTab !== 'notes') return;
    const el = mainScrollRef.current;
    if (!el) return;

    const sectionsCount = Math.max(1, notesSectionsRef.current.length);
    const denom = Math.max(1, (el.scrollHeight - el.clientHeight));
    const ratio = Math.max(0, Math.min(1, el.scrollTop / denom));
    const idx = Math.max(0, Math.min(sectionsCount - 1, Math.floor(ratio * sectionsCount)));
    activeNotesSectionRef.current = idx;
    notesSectionScrollEventsRef.current[idx] = (notesSectionScrollEventsRef.current[idx] || 0) + 1;
  };

  const splitNotesSections = (notes: string) => {
    const raw = String(notes || '');
    const parts = raw
      .split(/\n\n+/)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [raw];
  };

  useEffect(() => {
    if (bundle?.notes) {
      notesSectionsRef.current = splitNotesSections(bundle.notes);
      activeNotesSectionRef.current = 0;
      notesSectionSecondsRef.current = {};
      notesSectionScrollEventsRef.current = {};
    }
  }, [bundle?.notes, subtopic.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab !== 'notes') return;
      const idx = activeNotesSectionRef.current || 0;
      notesSectionSecondsRef.current[idx] = (notesSectionSecondsRef.current[idx] || 0) + 1;

      const secs = notesSectionSecondsRef.current[idx] || 0;
      const scrollEvents = notesSectionScrollEventsRef.current[idx] || 0;

      const metrics: BehavioralMetrics = extractNotesFeatures({
        time_spent_sec: secs,
        scroll_events: scrollEvents,
        expected_scroll_events: 15
      });

      if (secs >= 75 && scrollEvents >= 12) {
        simplifyResource({
          resourceType: 'notes_snippet',
          index: idx,
          current: notesSectionsRef.current[idx],
          cooldownKey: `notes_snippet_${idx}`,
          metrics
        });
        notesSectionSecondsRef.current[idx] = 0;
        notesSectionScrollEventsRef.current[idx] = 0;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gate: user must click to grant camera + enter fullscreen
  if (!sessionStarted) {
    return (
      <div className="fixed inset-0 bg-[#111113] z-[200] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-[#c4b998]/[0.04] rounded-full blur-[120px]" /><div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-[#8baa6e]/[0.03] rounded-full blur-[100px]" /></div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#c4b998] to-[#a89870] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-[#c4b998]/15">
            <GraduationCap size={48} className="text-[#111113]" />
          </div>
          <h2 className="text-3xl font-bold text-[#e8e4dc] tracking-tight mb-3">{subtopic.title}</h2>
          <p className="text-white/30 font-medium max-w-sm mb-10">This session will use your camera for focus monitoring and enter fullscreen mode.</p>
          <button
            onClick={handleStartSession}
            className="px-14 py-6 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-2xl font-bold tracking-wide shadow-2xl shadow-[#c4b998]/20 hover:-translate-y-1 active:scale-95 transition-all text-lg"
          >
            Start Session
          </button>
          <button
            onClick={onExit}
            className="mt-5 px-8 py-3 rounded-xl text-sm font-semibold text-white/40 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:text-white/60 hover:border-white/[0.14] active:scale-95 transition-all"
          >
            ← Cancel
          </button>
        </div>
      </div>
    );
  }

  if (isSynthesizing) {
    return (
      <div className="fixed inset-0 bg-[#111113] z-[200] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-[#c4b998]/[0.04] rounded-full blur-[120px]" /></div>
        <video ref={webcamRefCallback} autoPlay muted playsInline className="hidden absolute" aria-hidden="true" />
        <div className="w-16 h-16 border-4 border-[#c4b998] border-t-transparent rounded-full animate-spin mb-8"></div>
        <h2 className="text-3xl font-bold text-[#e8e4dc] tracking-tight">Sourcing Academic Bundle...</h2>
        <p className="text-white/30 font-medium mt-3 max-w-sm">Gathering readable textbooks, PDF notes, and topic-specific resources from global libraries.</p>
        <button
          onClick={onExit}
          className="mt-10 px-8 py-3 rounded-xl text-sm font-semibold text-white/30 border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:text-white/50 active:scale-95 transition-all"
        >
          ← Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#111113] z-[100] flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden">
      {/* Face detection warning overlay — only shown on video/quiz tabs */}
      {showFaceWarning && (activeTab === 'video' || activeTab === 'quiz') && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 px-6 py-4 bg-[#c97070] text-white rounded-2xl shadow-2xl shadow-[#c97070]/40 border border-[#c97070]">
            <AlertTriangle size={20} className="shrink-0 animate-pulse" />
            <div>
              <p className="font-bold text-sm">Face not detected!</p>
              <p className="text-[10px] font-medium text-white/80">
                {activeTab === 'quiz' ? 'Distraction logged. Stay focused during assessment.' : 'Please stay visible on screen.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <header className="h-20 border-b border-white/[0.06] flex items-center justify-between px-8 bg-[#111113]/80 backdrop-blur-xl shrink-0 relative z-20">
        <div className="flex items-center gap-5">
          {/* Webcam circle + monitoring badge */}
          <div className="flex items-center gap-3">
            {/* Webcam circle — only shown during quiz tab */}
            {activeTab === 'quiz' && (
              <div
                className={`w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg shrink-0 relative ${cameraActive ? (showFaceWarning ? 'border-[#c97070] shadow-[#c97070]/30' : 'border-[#c4b998] shadow-[#c4b998]/20 ring-2 ring-[#c4b998]/30') : 'border-white/20'}`}
                title="Face monitoring active — Quiz mode"
              >
                <video
                  ref={webcamRefCallback}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {!cameraActive && (
                  <div className="absolute inset-0 bg-white/[0.04] flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-[#c4b998] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {showFaceWarning && cameraActive && (
                  <div className="absolute inset-0 bg-[#c97070]/30 flex items-center justify-center animate-pulse">
                    <AlertTriangle size={16} className="text-white drop-shadow" />
                  </div>
                )}
              </div>
            )}
            {/* Monitoring status badge */}
            {activeTab === 'quiz' && cameraActive && (
              <div className="hidden sm:flex items-center gap-1.5 bg-[#c97070]/15 border border-[#c97070]/25 rounded-full px-3 py-1 animate-in fade-in duration-300">
                <div className="w-2 h-2 rounded-full bg-[#c97070] animate-pulse" />
                <span className="text-[9px] font-semibold text-[#c97070] uppercase tracking-wider">Monitoring</span>
              </div>
            )}
            {activeTab !== 'quiz' && (
              <div className="hidden sm:flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full px-3 py-1">
                <div className="w-2 h-2 rounded-full bg-white/20" />
                <span className="text-[9px] font-semibold text-white/20 uppercase tracking-wider">Idle</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#e8e4dc] tracking-tight leading-none truncate max-w-[200px] sm:max-w-md">{subtopic.title}</h1>
            <p className="text-[10px] font-semibold text-[#c4b998] uppercase tracking-widest mt-1">Adaptive Academic Node</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="hidden sm:flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2">
              <Clock size={13} className="text-[#c4b998]" />
              <div className="flex flex-col">
                <span className="text-[9px] font-semibold text-white/25 uppercase leading-none">Focus</span>
                <span className="text-sm font-bold text-[#c4b998] leading-tight">{Math.floor(focusTime/60)}m {focusTime % 60}s</span>
              </div>
           </div>
           <div className="hidden sm:flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2">
              <AlertTriangle size={13} className={distractions > 3 ? 'text-[#c97070]' : 'text-white/30'} />
              <div className="flex flex-col">
                <span className="text-[9px] font-semibold text-white/25 uppercase leading-none">Distractions</span>
                <span className={`text-sm font-bold leading-tight ${distractions > 3 ? 'text-[#c97070]' : 'text-white/50'}`}>{distractions}</span>
              </div>
           </div>
           {isFinalized ? (
             <button onClick={() => { document.exitFullscreen?.().catch(() => {}); onExit(); }} className="px-5 py-2.5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">
               Exit Session
             </button>
           ) : (
             <div className="w-10 h-10 bg-gradient-to-br from-[#c4b998] to-[#a89870] rounded-lg flex items-center justify-center text-[#111113] shadow-lg">
                <GraduationCap size={18} />
             </div>
           )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Premium Sidebar ─────────────────────────────────── */}
        <aside className="w-[88px] border-r border-white/[0.06] flex flex-col items-center py-8 gap-2 bg-[#0d0d0f]/80 backdrop-blur-2xl shrink-0 overflow-y-auto no-scrollbar relative z-10">
           {/* Active indicator rail */}
           {[
             { id: 'video', label: 'Watch', icon: <Youtube size={20}/> },
             { id: 'notes', label: 'Read', icon: <BookOpen size={20}/> },
             { id: 'materials', label: 'Library', icon: <LibraryBig size={20}/> },
             { id: 'flashcards', label: 'Cards', icon: <Layers size={20}/> },
             { id: 'quiz', label: 'Quiz', icon: <CheckCircle2 size={20}/> },
             { id: 'chat', label: 'Tutor', icon: <GraduationCap size={20}/> }
           ].map(t => (
             <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`relative flex flex-col items-center gap-1.5 group transition-all w-full py-3 ${activeTab === t.id ? 'text-[#c4b998]' : 'text-white/25 hover:text-white/50'}`}>
               {/* Left accent bar */}
               {activeTab === t.id && (
                 <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-gradient-to-b from-[#c4b998] to-[#a89870] rounded-r-full" />
               )}
               <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${activeTab === t.id ? 'bg-[#c4b998]/12 text-[#c4b998] shadow-md shadow-[#c4b998]/8' : 'bg-transparent group-hover:bg-white/[0.04]'}`}>
                 {t.icon}
               </div>
               <span className={`text-[8px] font-semibold uppercase tracking-[0.12em] transition-all ${activeTab === t.id ? 'text-[#c4b998] opacity-100' : 'opacity-40'}`}>{t.label}</span>
             </button>
           ))}
        </aside>

        {/* ── Main Content Area ────────────────────────────────── */}
        <main
          ref={(el) => { mainScrollRef.current = el; }}
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-12 bg-[#111113] relative figma-scrollbar scroll-smooth"
        >
          {/* Ambient glow effects */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#c4b998]/[0.025] rounded-full blur-[150px] -z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#8baa6e]/[0.015] rounded-full blur-[120px] -z-10 pointer-events-none" />
          
          {activeTab === 'video' && (
            <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-700 relative">
               <div className="flex justify-between items-end pb-6 relative z-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#c4b998]/60 mb-2">Video Resources</p>
                    <h3 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] tracking-tight">Visual Hub</h3>
                    <p className="text-white/25 font-medium mt-2">Curated videos for <span className="text-[#c4b998]">{subtopic.title}</span></p>
                  </div>
                  <div className="figma-glass px-4 py-2 flex items-center gap-2">
                    <Youtube size={14} className="text-[#c4b998]" />
                    <span className="text-xs font-semibold text-white/40">{bundle?.videos?.length || 0} videos</span>
                  </div>
               </div>

               {/* Hero Video (first video) */}
               {bundle?.videos && bundle.videos.length > 0 && (
                 <div className="figma-glass-blue p-6 md:p-8 group hover:bg-white/[0.04] transition-all duration-300">
                   <div className="aspect-video bg-black rounded-xl overflow-hidden mb-6 relative border border-white/[0.06] shadow-2xl shadow-black/40">
                     <iframe className="w-full h-full" src={getEmbedUrl(bundle.videos[0].url)} title={bundle.videos[0].title} frameBorder="0" allowFullScreen></iframe>
                   </div>
                   <div className="flex items-start justify-between gap-6">
                     <div className="flex-1 min-w-0">
                       <h4 className="font-bold text-xl md:text-2xl text-[#e8e4dc] mb-2 leading-tight group-hover:text-[#c4b998] transition-colors">{bundle.videos[0].title}</h4>
                       <p className="text-sm text-white/25 leading-relaxed line-clamp-2">{bundle.videos[0].description}</p>
                     </div>
                     <a onClick={() => handleVideoSourceClick(0)} href={bundle.videos[0].url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-lg text-xs font-bold uppercase tracking-wider hover:shadow-lg hover:shadow-[#c4b998]/15 transition-all shrink-0">
                       Source <ExternalLink size={13}/>
                     </a>
                   </div>
                 </div>
               )}

               {/* Remaining videos in grid */}
               {bundle?.videos && bundle.videos.length > 1 && (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                   {bundle.videos.slice(1).map((v, i) => (
                     <div key={i + 1} className="group figma-glass p-5 flex flex-col hover:bg-white/[0.05] transition-all duration-300">
                       <div className="aspect-video bg-black/60 rounded-lg overflow-hidden mb-5 relative border border-white/[0.06]">
                         <iframe className="w-full h-full" src={getEmbedUrl(v.url)} title={v.title} frameBorder="0" allowFullScreen></iframe>
                       </div>
                       <h4 className="font-semibold text-base text-[#e8e4dc] mb-2 leading-snug group-hover:text-[#c4b998] transition-colors line-clamp-2 flex-1">{v.title}</h4>
                       <p className="text-xs text-white/20 mb-4 leading-relaxed line-clamp-2">{v.description}</p>
                       <a onClick={() => handleVideoSourceClick(i + 1)} href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 w-full py-3 bg-white/[0.04] border border-white/[0.06] rounded-lg justify-center text-[10px] font-bold uppercase tracking-widest text-[#c4b998] hover:bg-[#c4b998]/10 hover:border-[#c4b998]/20 transition-all">
                         Source <ExternalLink size={12}/>
                       </a>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="max-w-4xl mx-auto pb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 relative">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#c4b998]/60 mb-2">Study Material</p>
              <h2 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] mb-10 tracking-tight">Mastery Notes</h2>
              <div className="figma-glass p-10 md:p-14 text-[#e8e4dc] relative overflow-hidden">
                 <div className="relative z-10 leading-relaxed text-lg" dangerouslySetInnerHTML={{ __html: (() => {
                   const raw = bundle?.notes || '';
                   if (/<[a-z][\s\S]*>/i.test(raw)) {
                     return raw
                       .replace(/<h1/g, '<h1 class="text-3xl font-bold text-[#e8e4dc] mt-10 mb-5"')
                       .replace(/<h2/g, '<h2 class="text-2xl font-bold text-[#c4b998] mt-10 mb-4 border-b border-white/10 pb-2"')
                       .replace(/<h3/g, '<h3 class="text-xl font-bold text-[#e8e4dc] mt-8 mb-3"')
                       .replace(/<strong/g, '<strong class="font-bold text-[#e8e4dc]"')
                       .replace(/<li/g, '<li class="ml-6 mb-2 text-white/70"')
                       .replace(/<p(?!\s*class)/g, '<p class="mb-4 text-white/60 leading-relaxed"');
                   }
                   return raw
                     .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-[#e8e4dc] mt-8 mb-3">$1</h3>')
                     .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-[#c4b998] mt-10 mb-4 border-b border-white/10 pb-2">$1</h2>')
                     .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold text-[#e8e4dc] mt-10 mb-5">$1</h1>')
                     .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-[#e8e4dc]">$1</strong>')
                     .replace(/\*(.+?)\*/g, '<em>$1</em>')
                     .replace(/`([^`]+)`/g, '<code class="bg-white/[0.06] text-[#c4b998] px-1.5 py-0.5 rounded text-[0.9em] font-mono">$1</code>')
                     .replace(/^[-•] (.+)$/gm, '<li class="ml-6 mb-2 list-disc text-white/60">$1</li>')
                     .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-6 mb-2 list-decimal text-white/60"><span class="font-bold text-[#c4b998] mr-1">$1.</span> $2</li>')
                     .replace(/((<li[^>]*>.*<\/li>\n?)+)/g, (m) => `<ul class="my-4 space-y-1">${m}</ul>`)
                     .replace(/\n{2,}/g, '</p><p class="mb-4 text-white/60 leading-relaxed">')
                     .replace(/\n/g, '<br/>')
                     .replace(/^/, '<p class="mb-4 text-white/60 leading-relaxed">')
                     .replace(/$/, '</p>');
                 })() }} />
              </div>
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 relative">
              <div className="flex justify-between items-end pb-6 relative z-10">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#c4b998]/60 mb-2">Reference Material</p>
                  <h3 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] tracking-tight">Reference Library</h3>
                  <p className="text-white/25 font-medium mt-2">Curated textbooks and academic PDF guides.</p>
                </div>
                <div className="p-4 figma-glass rounded-2xl text-[#c4b998]"><LibraryBig size={32} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                {bundle?.materials && bundle.materials.length > 0 ? (
                  bundle.materials.map((m, i) => (
                    <div key={i} className="figma-glass p-8 group flex flex-col hover:bg-white/[0.06] transition-all duration-300">
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#c4b998] mb-6 group-hover:bg-[#c4b998]/10 group-hover:border-[#c4b998]/20 transition-all">
                        {m.type === 'pdf' ? <FileSearch size={28}/> : m.type === 'textbook' ? <BookOpen size={28}/> : <FileText size={28}/>}
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[10px] font-bold uppercase bg-[#c4b998]/15 text-[#c4b998] px-3 py-1 rounded-full border border-[#c4b998]/20">{m.type}</span>
                      </div>
                      <h4 className="text-xl font-bold text-[#e8e4dc] mb-3 leading-tight group-hover:text-[#c4b998] transition-colors duration-300 line-clamp-2">{m.title}</h4>
                      <p className="text-sm text-white/30 leading-relaxed mb-8 flex-1 line-clamp-3">{m.description}</p>
                      <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 w-full py-4 bg-white/[0.04] border border-white/[0.08] rounded-xl justify-center text-xs font-bold text-[#c4b998] hover:bg-[#c4b998] hover:text-[#111113] transition-all duration-300">
                        Open Textbook <ExternalLink size={14}/>
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-24 flex flex-col items-center justify-center figma-glass text-white/30">
                    <FileSearch size={48} className="mb-4 animate-pulse opacity-30 text-[#c4b998]" />
                    <p className="text-base font-medium text-white/40">Locating high-relevance textbooks and PDF resources...</p>
                  </div>
                )}
              </div>
              <div className="figma-glass-blue p-8 flex items-center gap-6">
                <div className="w-14 h-14 bg-gradient-to-br from-[#c4b998] to-[#a89870] text-[#111113] rounded-2xl flex items-center justify-center shrink-0 shadow-lg"><BookOpen size={24}/></div>
                <div>
                   <p className="text-lg font-bold text-[#e8e4dc] mb-1">Digital Library Active</p>
                   <p className="text-sm text-white/30 leading-relaxed max-w-3xl">These resources are curated from open-source educational repositories (OER) specifically cross-referenced for <span className="text-[#c4b998]">"{subtopic.title}"</span>.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'flashcards' && (
            <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-700">
              <div className="pb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#c4b998]/60 mb-2">Review Cards</p>
                <h3 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] tracking-tight">Flash Cards</h3>
                <p className="text-white/25 font-medium mt-2">Tap a card to flip it. Review before taking the quiz.</p>
              </div>
              {bundle?.flashcards && bundle.flashcards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {bundle.flashcards.map((fc, i) => {
                    const isFlipped = flippedCards.has(i);
                    return (
                      <div
                        key={i}
                        onClick={() => setFlippedCards(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        })}
                        className="cursor-pointer group perspective-[800px]"
                      >
                        <div className={`relative w-full min-h-[220px] transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
                          {/* Front */}
                          <div className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-[#c4b998] to-[#a89870] rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-xl">
                            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#111113]/50 mb-4">Question</span>
                            <p className="text-[#111113] font-bold text-lg leading-snug">{fc.front}</p>
                            <span className="text-[9px] font-medium text-[#111113]/40 mt-6 uppercase tracking-widest">Tap to flip</span>
                          </div>
                          {/* Back */}
                          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] figma-glass p-8 flex flex-col items-center justify-center text-center">
                            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#c4b998] mb-4">Answer</span>
                            <p className="text-[#e8e4dc] font-medium text-base leading-relaxed">{fc.back}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center figma-glass text-white/30">
                  <Layers size={48} className="mb-4 animate-pulse opacity-30 text-[#c4b998]" />
                  <p className="text-base font-medium text-white/40">No flashcards available for this topic.</p>
                </div>
              )}
              <div className="text-center pt-4">
                <button
                  onClick={() => setActiveTab('quiz')}
                  className="px-12 py-5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-bold uppercase tracking-widest shadow-lg hover:shadow-[#c4b998]/15 active:scale-95 transition-all"
                >
                  Ready for Quiz →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'quiz' && (
            <div className="max-w-3xl mx-auto h-full flex flex-col justify-center animate-in fade-in duration-500">
               {bundle?.quiz && !quizFinished ? (
                 <>
                   {!quizStarted ? (
                     <div className="space-y-10 animate-in zoom-in-95 duration-500 text-center">
                       <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#c4b998] to-[#a89870] flex items-center justify-center mx-auto shadow-xl shadow-[#c4b998]/15">
                         <Sparkles size={48} className="text-[#111113]" />
                       </div>
                       <div>
                         <h3 className="text-4xl font-bold text-[#e8e4dc] tracking-tight">Mandatory Assessment</h3>
                         <p className="text-white/30 font-medium mt-2">10-question quiz to verify your understanding.</p>
                       </div>
                       
                       <div className="figma-glass p-10 space-y-6">
                         <div className="flex flex-col items-center">
                           <span className="text-6xl font-bold text-[#c4b998] w-24 text-center">10</span>
                           <span className="text-xs font-semibold uppercase text-white/30 tracking-widest mt-2">Questions</span>
                           <p className="text-xs text-white/20 mt-4">Available from Pool: {bundle.quiz.length}</p>
                         </div>
                       </div>

                       <button 
                         onClick={handleStartQuiz}
                         className="w-full py-6 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-bold uppercase tracking-widest shadow-2xl shadow-[#c4b998]/20 hover:-translate-y-1 active:scale-95 transition-all text-lg"
                       >
                         Start Assessment
                       </button>
                     </div>
                   ) : (
                    <div className="space-y-8">
                      <div className="figma-glass p-8 md:p-10 relative">
                        <div className="absolute -top-4 left-8 px-5 py-1.5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] text-[10px] font-bold uppercase rounded-full tracking-widest shadow-md">
                          Question {currentQuizIndex + 1} / {activeQuizSet.length}
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-white/[0.06] h-1.5 rounded-full mb-8 mt-2 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#c4b998] to-[#a89870] rounded-full transition-all duration-500" style={{ width: `${((currentQuizIndex + 1) / activeQuizSet.length) * 100}%` }} />
                        </div>
                        <p className="text-xl md:text-2xl font-bold text-[#e8e4dc] mb-10 leading-snug">{activeQuizSet[currentQuizIndex]?.question}</p>
                        <div className="space-y-3">
                           {activeQuizSet[currentQuizIndex]?.options.map((o, idx) => {
                             const isSelected = selectedQuizOption === o;
                             const currentQ = activeQuizSet[currentQuizIndex];
                             const isCorrectAnswer = showAnswer && matchesAnswer(o, currentQ?.answer ?? '', currentQ?.options ?? []);
                             const isWrongSelected = showAnswer && isSelected && !matchesAnswer(o, currentQ?.answer ?? '', currentQ?.options ?? []);
                             return (
                               <button
                                 key={idx}
                                 onClick={() => !showAnswer && setSelectedQuizOption(o)}
                                 disabled={showAnswer}
                                 className={`w-full text-left p-5 md:p-6 rounded-xl border font-medium text-base transition-all duration-300 ${
                                   isCorrectAnswer
                                     ? 'border-[#8baa6e] bg-[#8baa6e]/15 text-[#8baa6e]'
                                     : isWrongSelected
                                       ? 'border-[#c97070] bg-[#c97070]/15 text-[#c97070]'
                                       : isSelected
                                         ? 'border-[#c4b998] bg-[#c4b998]/10 text-[#e8e4dc]'
                                         : showAnswer
                                           ? 'border-white/[0.06] bg-white/[0.02] text-white/20'
                                           : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.15] text-[#e8e4dc]'
                                 }`}
                               >
                                 <span className="flex items-start gap-4">
                                   <span className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-full text-sm font-bold transition-colors ${
                                     isCorrectAnswer ? 'bg-[#8baa6e] text-[#111113]'
                                     : isWrongSelected ? 'bg-[#c97070] text-white'
                                     : isSelected ? 'bg-[#c4b998] text-[#111113]'
                                     : 'bg-white/[0.06] text-white/50'
                                   }`}>{String.fromCharCode(65 + idx)}</span>
                                   <span className="leading-relaxed pt-0.5 text-inherit">{o}</span>
                                 </span>
                               </button>
                             );
                           })}
                        </div>
                      </div>
                      {selectedQuizOption && !showAnswer && (
                        <button onClick={() => setShowAnswer(true)} className="w-full py-5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-[#c4b998]/15 hover:-translate-y-0.5 active:scale-[0.98] transition-all">Verify Selection</button>
                      )}
                      {showAnswer && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                          <div className={`p-6 rounded-xl border ${matchesAnswer(selectedQuizOption, activeQuizSet[currentQuizIndex]?.answer ?? '', activeQuizSet[currentQuizIndex]?.options ?? []) ? 'bg-[#8baa6e]/10 border-[#8baa6e]/30 text-[#8baa6e]' : 'bg-[#c97070]/10 border-[#c97070]/30 text-[#c97070]'}`}>
                            <p className="font-bold text-lg mb-2">{matchesAnswer(selectedQuizOption, activeQuizSet[currentQuizIndex]?.answer ?? '', activeQuizSet[currentQuizIndex]?.options ?? []) ? '✓ Correct' : '✗ Incorrect'}</p>
                            <p className="text-sm font-medium leading-relaxed text-white/60">{activeQuizSet[currentQuizIndex]?.explanation || ''}</p>
                          </div>
                          <button onClick={() => {
                            const currentQ = activeQuizSet[currentQuizIndex];
                            if (!currentQ) return;
                            const isCorrect = matchesAnswer(selectedQuizOption, currentQ.answer, currentQ.options);
                            if (isCorrect) setQuizScore(s => s + 1);

                            if (!isCorrect) {
                              quizWrongAnswersRef.current.push(
                                `Q: ${currentQ.question} | Correct: ${currentQ.answer} | Explanation: ${currentQ.explanation || 'N/A'}`
                              );
                            }

                            if (currentQuizIndex < activeQuizSet.length - 1) {
                              setCurrentQuizIndex(i => i + 1);
                              setSelectedQuizOption(null);
                              setShowAnswer(false);
                              quizQuestionStartAtRef.current = Date.now();
                            } else {
                              setQuizFinished(true);
                            }
                          }} className="w-full py-5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-bold uppercase tracking-widest shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all">
                            {currentQuizIndex < activeQuizSet.length - 1 ? 'Next Question' : 'View Results'}
                          </button>
                        </div>
                      )}
                    </div>
                   )}
                 </>
               ) : quizFinished ? (
                 <div className="text-center space-y-10 animate-in zoom-in-95 duration-500">
                    <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#c4b998] to-[#a89870] flex items-center justify-center mx-auto text-5xl shadow-xl shadow-[#c4b998]/15">🏆</div>
                    <div>
                      <h2 className="text-4xl font-bold text-[#e8e4dc] tracking-tight">Session Optimized</h2>
                      <p className="text-white/30 font-medium mt-4 text-xl">Verification Accuracy: {Math.round((quizScore / (activeQuizSet.length || 1)) * 100)}%</p>
                      <p className="text-white/20 text-xs mt-2 uppercase font-semibold tracking-widest">{quizScore} correct out of {activeQuizSet.length}</p>
                    </div>
                    <button
                      onClick={finalizeSession}
                      disabled={isFinalizing || isFinalized}
                      className={`w-full py-6 rounded-xl font-bold uppercase tracking-widest shadow-2xl transition-all ${
                        isFinalizing || isFinalized
                          ? 'bg-white/[0.06] text-white/20 cursor-not-allowed'
                          : 'bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] hover:-translate-y-1 active:scale-95 shadow-[#c4b998]/20'
                      }`}
                    >
                      {isFinalized ? 'Session Saved' : isFinalizing ? 'Finalizing...' : 'Finalize Mastery'}
                    </button>
                 </div>
               ) : null}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex flex-col h-full max-w-4xl mx-auto animate-in fade-in duration-500">
               <div className="flex-1 overflow-y-auto space-y-6 pb-20 figma-scrollbar pr-6">
                  {agent.chat_history.map((m, i) => (
                    <div key={i} className={`p-6 rounded-2xl text-sm font-medium leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] ml-20' : 'figma-glass mr-20 text-[#e8e4dc]'}`}>
                       {m.text}
                    </div>
                  ))}
                  {isTyping && <div className="text-xs font-semibold text-[#c4b998] animate-pulse uppercase tracking-widest ml-8">Neural Agent Processing...</div>}
               </div>
               <form onSubmit={handleSendMessage} className="pt-6 flex gap-4 bg-[#111113] sticky bottom-0 border-t border-white/[0.06] mt-4 relative z-10">
                  <input type="text" placeholder="Query your neural tutor..." className="flex-1 px-8 py-5 bg-white/[0.04] border border-white/[0.08] rounded-xl outline-none font-medium text-[#e8e4dc] placeholder:text-white/20 focus:border-[#c4b998]/30 transition-colors" value={chatInput} onChange={e => setChatInput(e.target.value)} />
                  <button type="submit" className="w-16 h-16 bg-gradient-to-br from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl flex items-center justify-center font-bold shadow-lg">↑</button>
               </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default StudySession;
