
import React, { useState, useEffect, useRef } from 'react';
import { SubTopic, MasteryState, ChatMessage, LearningAgent, AcademicBundle, CognitiveLoadState, QuizItem } from '../types';
import { fastapiService } from '../services/fastapiService';
import { BehavioralMetrics } from '../services/quantumSimulator';
import { extractNotesFeatures, extractQuizFeatures, extractVideoFeatures } from '../services/qsvmFeatureExtractor';
import { ExternalLink, Youtube, FileText, BookOpen, GraduationCap, CheckCircle2, FileSearch, LibraryBig, Sparkles, Layers, AlertTriangle } from 'lucide-react';

interface StudySessionProps {
  subtopic: SubTopic;
  agent: LearningAgent;
  onComplete: (stats: { focusTime: number, distractions: number, bundle: AcademicBundle, loadState: CognitiveLoadState, quizScore?: number, wrongAnswers?: string[] }) => void;
  onExit: () => void;
  onUpdateChat: (messages: ChatMessage[]) => void;
}

const StudySession: React.FC<StudySessionProps> = ({ subtopic, agent, onComplete, onExit, onUpdateChat }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'notes' | 'materials' | 'flashcards' | 'quiz' | 'chat'>('video');
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [timeSpent, setTimeSpent] = useState(0);
  const [focusTime, setFocusTime] = useState(0);
  const [distractions, setDistractions] = useState(0);
  
  const [isSynthesizing, setIsSynthesizing] = useState(!subtopic.is_synthesized);
  const [bundle, setBundle] = useState<AcademicBundle | undefined>(subtopic.bundle);
  
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Quiz State
  const [quizStarted, setQuizStarted] = useState(false);
  const [userDesiredQuestions, setUserDesiredQuestions] = useState(5);
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
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const faceCheckRef = useRef<any>(null);
  const [showFaceWarning, setShowFaceWarning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const faceWarningTimeoutRef = useRef<any>(null);
  const consecutiveMissRef = useRef(0);

  // Fullscreen + Webcam setup
  useEffect(() => {
    // Request fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {});

    // Start webcam
    navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 160, facingMode: 'user' } })
      .then(stream => {
        webcamStreamRef.current = stream;
        if (webcamRef.current) {
          webcamRef.current.srcObject = stream;
          webcamRef.current.play().catch(() => {});
        }
        setCameraActive(true);

        // Face detection loop (Chrome FaceDetector API)
        if ('FaceDetector' in window) {
          const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          faceCheckRef.current = setInterval(async () => {
            if (!webcamRef.current || webcamRef.current.readyState < 2) return;
            canvas.width = webcamRef.current.videoWidth || 160;
            canvas.height = webcamRef.current.videoHeight || 160;
            ctx.drawImage(webcamRef.current, 0, 0);
            try {
              const faces = await detector.detect(canvas);
              if (faces.length === 0) {
                consecutiveMissRef.current += 1;
                if (consecutiveMissRef.current >= 2) {
                  setShowFaceWarning(true);
                  setDistractions(d => d + 1);
                  // Auto-hide warning after 5s
                  clearTimeout(faceWarningTimeoutRef.current);
                  faceWarningTimeoutRef.current = setTimeout(() => setShowFaceWarning(false), 5000);
                }
              } else {
                consecutiveMissRef.current = 0;
                setShowFaceWarning(false);
              }
            } catch {}
          }, 3000);
        }
      })
      .catch(() => setCameraActive(false));

    return () => {
      // Cleanup
      if (faceCheckRef.current) clearInterval(faceCheckRef.current);
      if (faceWarningTimeoutRef.current) clearTimeout(faceWarningTimeoutRef.current);
      webcamStreamRef.current?.getTracks().forEach(t => t.stop());
      document.exitFullscreen?.().catch(() => {});
    };
  }, []);

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
    if (!subtopic.is_synthesized || !bundle) synthesizeNode();
  }, [subtopic.id]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeSpent(prev => prev + 1);
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
    const sliced = shuffled.slice(0, Math.min(userDesiredQuestions, bundle.quiz.length));
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

  const finalizeSession = async () => {
    if (isFinalizing || isFinalized) return;
    setIsFinalizing(true);

    const attempts = activeQuizSet.length || 1;
    const accuracy = quizScore / attempts;
    const errorRate = Math.max(0, Math.min(1, 1 - accuracy));
    const metrics: BehavioralMetrics = {
      time_spent: timeSpent,
      response_time: 0,
      error_rate: errorRate,
      retries: 0,
      interaction_frequency: agent.chat_history.length / Math.max(1, timeSpent / 60)
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
    onComplete({ focusTime, distractions, bundle: bundle!, loadState, quizScore: quizScorePercent, wrongAnswers: quizWrongAnswersRef.current.length > 0 ? quizWrongAnswersRef.current : undefined });
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
  }, [activeTab, agent.chat_history.length, focusTime, timeSpent]);

  if (isSynthesizing) {
    return (
      <div className="fixed inset-0 bg-white z-[200] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-8 shadow-xl"></div>
        <h2 className="text-3xl font-black italic tracking-tighter">Sourcing Academic Bundle...</h2>
        <p className="text-slate-500 font-medium mt-3 max-w-sm">Gathering readable textbooks, PDF notes, and topic-specific resources from global libraries.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden">
      {/* Face detection warning overlay */}
      {showFaceWarning && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 px-6 py-4 bg-rose-500 text-white rounded-2xl shadow-2xl shadow-rose-500/40 border border-rose-400">
            <AlertTriangle size={20} className="shrink-0 animate-pulse" />
            <div>
              <p className="font-black text-sm">Face not detected!</p>
              <p className="text-[10px] font-bold text-rose-100">Please stay focused on your screen. Distraction logged.</p>
            </div>
          </div>
        </div>
      )}

      <header className="h-20 border-b flex items-center justify-between px-8 bg-white shrink-0 relative z-20 shadow-sm">
        <div className="flex items-center gap-5">
          {/* Webcam circle */}
          <div className={`w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg shrink-0 relative ${cameraActive ? (showFaceWarning ? 'border-rose-500 shadow-rose-500/30' : 'border-emerald-500 shadow-emerald-500/20') : 'border-slate-300'}`}>
            <video
              ref={webcamRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                <GraduationCap size={20} className="text-slate-400" />
              </div>
            )}
            {showFaceWarning && cameraActive && (
              <div className="absolute inset-0 bg-rose-500/30 flex items-center justify-center animate-pulse">
                <AlertTriangle size={16} className="text-white drop-shadow" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none truncate max-w-[200px] sm:max-w-md">{subtopic.title}</h1>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Adaptive Academic Node</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-400 uppercase">Focus Timer</span>
              <span className="text-sm font-black italic text-indigo-600">{Math.floor(focusTime/60)}m {focusTime % 60}s</span>
           </div>
           <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-400 uppercase">Distractions</span>
              <span className={`text-sm font-black italic ${distractions > 3 ? 'text-rose-500' : 'text-slate-600'}`}>{distractions}</span>
           </div>
           {isFinalized ? (
             <button onClick={() => { document.exitFullscreen?.().catch(() => {}); onExit(); }} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
               Exit Session
             </button>
           ) : (
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                <GraduationCap size={20} />
             </div>
           )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-28 border-r border-slate-100 flex flex-col items-center py-10 gap-8 bg-slate-50/50 backdrop-blur-md shrink-0 overflow-y-auto no-scrollbar relative z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
           {[
             { id: 'video', label: 'Watch', icon: <Youtube size={22}/> },
             { id: 'notes', label: 'Read', icon: <BookOpen size={22}/> },
             { id: 'materials', label: 'Library', icon: <LibraryBig size={22}/> },
             { id: 'flashcards', label: 'Cards', icon: <Layers size={22}/> },
             { id: 'quiz', label: 'Quiz', icon: <CheckCircle2 size={22}/> },
             { id: 'chat', label: 'Tutor', icon: <GraduationCap size={22}/> }
           ].map(t => (
             <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center gap-3 group transition-all w-full px-2 ${activeTab === t.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
               <div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center transition-all duration-500 relative ${activeTab === t.id ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30 rotate-3 scale-110' : 'bg-white border border-slate-200 shadow-sm group-hover:border-indigo-300 group-hover:shadow-md'}`}>
                 {activeTab === t.id && (
                    <div className="absolute inset-0 bg-white/20 rounded-[1.2rem] animate-pulse pointer-events-none" />
                 )}
                 {t.icon}
               </div>
               <span className={`text-[9px] font-black uppercase tracking-widest transition-transform ${activeTab === t.id ? 'scale-100' : 'scale-90 opacity-70'}`}>{t.label}</span>
             </button>
           ))}
        </aside>

        <main
          ref={(el) => { mainScrollRef.current = el; }}
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto p-8 md:p-12 bg-white relative custom-scrollbar scroll-smooth"
        >
          {/* Subtle animated background gradients for the main area */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white to-indigo-50/20 -z-10 pointer-events-none" />
          
          {activeTab === 'video' && (
            <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 relative">
               <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full -z-10 pointer-events-none animate-float" />
               
               <div className="flex justify-between items-end border-b border-slate-100 pb-8 relative z-10">
                  <div>
                    <h3 className="text-5xl font-black italic tracking-tighter drop-shadow-sm">Visual Hub</h3>
                    <p className="text-slate-500 font-medium mt-2 text-lg">Curated video intelligence for <span className="text-indigo-600 font-bold">{subtopic.title}</span>.</p>
                  </div>
               </div>
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 relative z-10">
                  {bundle?.videos.map((v, i) => (
                    <div key={i} className="group bg-white/80 backdrop-blur-xl p-8 rounded-[3rem] border border-slate-200 hover:border-indigo-400/50 transition-all duration-500 shadow-lg hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col">
                      <div className="aspect-video bg-slate-900 rounded-[2.5rem] overflow-hidden mb-8 relative border-4 border-slate-50 shadow-inner group-hover:border-indigo-50 transform transition-all duration-500">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none z-10" />
                        <iframe className="w-full h-full relative z-0" src={getEmbedUrl(v.url)} title={v.title} frameBorder="0" allowFullScreen></iframe>
                      </div>
                      <h4 className="font-black text-2xl mb-4 leading-tight group-hover:text-indigo-600 transition-colors duration-300">{v.title}</h4>
                      <p className="text-sm text-slate-500 mb-8 leading-relaxed line-clamp-3 flex-1">{v.description}</p>
                      <a onClick={() => handleVideoSourceClick(i)} href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 w-full py-5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-2xl justify-center text-[11px] font-black uppercase tracking-widest hover:from-indigo-600 hover:to-violet-600 transition-all shadow-xl hover:shadow-indigo-500/30 group/btn overflow-hidden relative">
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                        <span className="relative z-10 flex items-center gap-3">Source Stream <ExternalLink size={16} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform"/></span>
                      </a>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="max-w-4xl mx-auto academic-content pb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 relative">
              <div className="absolute -top-20 left-10 w-64 h-64 bg-fuchsia-500/5 blur-[100px] rounded-full -z-10 pointer-events-none" />
              <h2 className="text-6xl font-black mb-12 tracking-tighter leading-tight drop-shadow-sm">Mastery Notes</h2>
              <div className="figma-glass-blue !bg-white/60 p-12 md:p-16 rounded-[4rem] text-slate-800 shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-white/20 pointer-events-none" />
                 <div className="relative z-10 leading-relaxed text-lg prose prose-lg max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-indigo-600 hover:prose-a:text-indigo-500 prose-img:rounded-3xl prose-img:shadow-xl" dangerouslySetInnerHTML={{ __html: (() => {
                   const raw = bundle?.notes || '';
                   // If already contains HTML tags, use as-is with styling
                   if (/<[a-z][\s\S]*>/i.test(raw)) {
                     return raw
                       .replace(/<h1/g, '<h1 class="text-3xl font-black text-indigo-900 mt-10 mb-5"')
                       .replace(/<h2/g, '<h2 class="text-2xl font-black text-indigo-800 mt-10 mb-4 border-b border-indigo-100 pb-2"')
                       .replace(/<h3/g, '<h3 class="text-xl font-black text-indigo-700 mt-8 mb-3"')
                       .replace(/<strong/g, '<strong class="font-black text-slate-900"')
                       .replace(/<li/g, '<li class="ml-6 mb-2 text-slate-700"')
                       .replace(/<p(?!\s*class)/g, '<p class="mb-4 text-slate-700 leading-relaxed"');
                   }
                   // Markdown to HTML conversion
                   return raw
                     .replace(/^### (.+)$/gm, '<h3 class="text-xl font-black text-indigo-700 mt-8 mb-3">$1</h3>')
                     .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-black text-indigo-800 mt-10 mb-4 border-b border-indigo-100 pb-2">$1</h2>')
                     .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-black text-indigo-900 mt-10 mb-5">$1</h1>')
                     .replace(/\*\*(.+?)\*\*/g, '<strong class="font-black text-slate-900">$1</strong>')
                     .replace(/\*(.+?)\*/g, '<em>$1</em>')
                     .replace(/`([^`]+)`/g, '<code class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[0.9em] font-mono">$1</code>')
                     .replace(/^[-•] (.+)$/gm, '<li class="ml-6 mb-2 list-disc text-slate-700">$1</li>')
                     .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-6 mb-2 list-decimal text-slate-700"><span class="font-black text-indigo-600 mr-1">$1.</span> $2</li>')
                     .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul class="my-4 space-y-1">${m}</ul>`)
                     .replace(/\n{2,}/g, '</p><p class="mb-4 text-slate-700 leading-relaxed">')
                     .replace(/\n/g, '<br/>')
                     .replace(/^/, '<p class="mb-4 text-slate-700 leading-relaxed">')
                     .replace(/$/, '</p>');
                 })() }} />
              </div>
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 relative">
              <div className="absolute top-20 right-20 w-80 h-80 bg-emerald-500/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
              
              <div className="border-b border-slate-100 pb-8 flex justify-between items-end relative z-10">
                <div>
                  <h3 className="text-5xl font-black italic tracking-tighter drop-shadow-sm">Reference Library</h3>
                  <p className="text-slate-500 font-medium mt-2 text-lg">Curated textbooks and academic PDF guides.</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-3xl text-indigo-600 shadow-sm border border-indigo-100/50 transform rotate-3"><LibraryBig size={32} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
                {bundle?.materials && bundle.materials.length > 0 ? (
                  bundle.materials.map((m, i) => (
                    <div key={i} className="p-10 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-[3.5rem] hover:border-indigo-400/60 transition-all duration-500 group flex flex-col shadow-lg hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-2 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-2xl rounded-full -m-10 group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />
                      
                      <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 flex items-center justify-center text-indigo-600 mb-8 shadow-md group-hover:shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 relative z-10">
                        {m.type === 'pdf' ? <FileSearch size={32}/> : m.type === 'textbook' ? <BookOpen size={32}/> : <FileText size={32}/>}
                      </div>
                      <div className="flex items-center gap-3 mb-5 relative z-10">
                        <span className="text-[10px] font-black uppercase bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-sm">{m.type}</span>
                        <div className="flex items-center justify-center w-6 h-6 bg-amber-50 rounded-full border border-amber-100">
                           <Sparkles size={12} className="text-amber-500" />
                        </div>
                      </div>
                      <h4 className="text-2xl font-black mb-4 leading-tight text-slate-900 group-hover:text-indigo-600 transition-colors duration-300 line-clamp-2 relative z-10">{m.title}</h4>
                      <p className="text-sm text-slate-500 leading-relaxed mb-10 flex-1 line-clamp-3 relative z-10">{m.description}</p>
                      <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 w-full py-5 bg-slate-50 border border-slate-200 rounded-2xl justify-center text-[11px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-600 hover:border-indigo-600 hover:text-white transition-all duration-300 shadow-sm hover:shadow-xl relative z-10 group/btn overflow-hidden">
                        <span className="relative z-10 flex items-center gap-2">Open Textbook <ExternalLink size={16} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform"/></span>
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-32 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm border-2 border-dashed border-slate-200 rounded-[4rem] text-slate-400">
                    <FileSearch size={64} className="mb-6 animate-pulse opacity-30 text-indigo-300" />
                    <p className="text-lg font-bold text-slate-500">Locating high-relevance textbooks and PDF resources...</p>
                  </div>
                )}
              </div>
              <div className="p-10 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100/50 rounded-[3rem] flex items-center gap-8 shadow-inner relative overflow-hidden group">
                <div className="absolute inset-0 bg-white/40 group-hover:bg-white/20 transition-colors duration-500 pointer-events-none" />
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-[2rem] flex items-center justify-center shrink-0 shadow-lg relative z-10"><BookOpen size={28}/></div>
                <div className="relative z-10">
                   <p className="text-xl font-black text-indigo-950 mb-1">Digital Library Active</p>
                   <p className="text-sm font-bold text-indigo-800/70 leading-relaxed max-w-3xl">These resources are curated from open-source educational repositories (OER) specifically cross-referenced for <span className="text-indigo-600">"{subtopic.title}"</span>.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'flashcards' && (
            <div className="max-w-3xl mx-auto space-y-12 animate-in fade-in duration-700">
              <div className="border-b border-slate-100 pb-8">
                <h3 className="text-5xl font-black italic tracking-tighter drop-shadow-sm">Flash Cards</h3>
                <p className="text-slate-500 font-medium mt-2 text-lg">Tap a card to flip it. Review before taking the quiz.</p>
              </div>
              {bundle?.flashcards && bundle.flashcards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                          <div className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-indigo-500 to-violet-600 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center shadow-xl border border-white/20">
                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-200 mb-4">Question</span>
                            <p className="text-white font-black text-lg leading-snug">{fc.front}</p>
                            <span className="text-[9px] font-bold text-indigo-200/60 mt-6 uppercase tracking-widest">Tap to flip</span>
                          </div>
                          {/* Back */}
                          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-white rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center shadow-xl border-2 border-indigo-200">
                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-4">Answer</span>
                            <p className="text-slate-800 font-bold text-base leading-relaxed">{fc.back}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-32 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm border-2 border-dashed border-slate-200 rounded-[4rem] text-slate-400">
                  <Layers size={64} className="mb-6 animate-pulse opacity-30 text-indigo-300" />
                  <p className="text-lg font-bold text-slate-500">No flashcards available for this topic.</p>
                </div>
              )}
              <div className="text-center pt-4">
                <button
                  onClick={() => setActiveTab('quiz')}
                  className="px-12 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 active:scale-95 transition-all"
                >
                  Ready for Quiz →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'quiz' && (
            <div className="max-w-2xl mx-auto h-full flex flex-col justify-center animate-in fade-in duration-500">
               {bundle?.quiz && !quizFinished ? (
                 <>
                   {!quizStarted ? (
                     <div className="space-y-12 animate-in zoom-in-95 duration-500 text-center">
                       <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-indigo-600 shadow-inner">
                         <Sparkles size={48} />
                       </div>
                       <div>
                         <h3 className="text-4xl font-black tracking-tighter">Personalized Assessment</h3>
                         <p className="text-slate-500 font-medium mt-2">Choose the number of questions for this session.</p>
                       </div>
                       
                       <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-slate-100 space-y-8">
                         <div className="flex flex-col items-center">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Select Question Count</label>
                           <div className="flex items-center gap-6">
                             <button 
                               onClick={() => setUserDesiredQuestions(Math.max(1, userDesiredQuestions - 1))}
                               className="w-12 h-12 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center font-black text-xl hover:bg-slate-50 active:scale-90 transition-all shadow-sm"
                             >-</button>
                             <div className="flex flex-col items-center">
                               <span className="text-6xl font-black italic text-indigo-600 w-24 text-center">{userDesiredQuestions}</span>
                               <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Questions</span>
                             </div>
                             <button 
                               onClick={() => setUserDesiredQuestions(Math.min(bundle.quiz.length, userDesiredQuestions + 1))}
                               className="w-12 h-12 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center font-black text-xl hover:bg-slate-50 active:scale-90 transition-all shadow-sm"
                             >+</button>
                           </div>
                           <p className="text-[10px] font-bold text-slate-400 mt-6 uppercase tracking-widest">Available from Pool: {bundle.quiz.length}</p>
                         </div>
                       </div>

                       <button 
                         onClick={handleStartQuiz}
                         className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all"
                       >
                         Start Personalized Quiz
                       </button>
                     </div>
                   ) : (
                    <div className="space-y-10">
                      <div className="p-8 md:p-12 border-2 border-slate-200 rounded-[2.5rem] bg-white shadow-xl relative">
                        <div className="absolute -top-4 left-8 px-5 py-1.5 bg-slate-900 text-white text-[10px] font-black uppercase rounded-full tracking-widest shadow-md">
                          Question {currentQuizIndex + 1} / {activeQuizSet.length}
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mb-8 mt-2 overflow-hidden">
                          <div className="h-full bg-slate-900 rounded-full transition-all duration-500" style={{ width: `${((currentQuizIndex + 1) / activeQuizSet.length) * 100}%` }} />
                        </div>
                        <p className="text-xl md:text-2xl font-black text-black mb-10 leading-snug">{activeQuizSet[currentQuizIndex]?.question}</p>
                        <div className="space-y-3">
                           {activeQuizSet[currentQuizIndex]?.options.map((o, idx) => {
                             const isSelected = selectedQuizOption === o;
                             const isCorrectAnswer = showAnswer && o === activeQuizSet[currentQuizIndex]?.answer;
                             const isWrongSelected = showAnswer && isSelected && o !== activeQuizSet[currentQuizIndex]?.answer;
                             return (
                               <button
                                 key={idx}
                                 onClick={() => !showAnswer && setSelectedQuizOption(o)}
                                 disabled={showAnswer}
                                 className={`w-full text-left p-5 md:p-6 rounded-2xl border-2 font-semibold text-base transition-all duration-300 ${
                                   isCorrectAnswer
                                     ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                                     : isWrongSelected
                                       ? 'border-rose-500 bg-rose-50 text-rose-900'
                                       : isSelected
                                         ? 'border-slate-900 bg-slate-100 text-black shadow-md'
                                         : showAnswer
                                           ? 'border-slate-200 bg-slate-50 text-slate-400'
                                           : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-400 text-black'
                                 }`}
                               >
                                 <span className="flex items-start gap-4">
                                   <span className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-full text-sm font-black transition-colors ${
                                     isCorrectAnswer ? 'bg-emerald-500 text-white'
                                     : isWrongSelected ? 'bg-rose-500 text-white'
                                     : isSelected ? 'bg-slate-900 text-white'
                                     : 'bg-slate-100 text-slate-700'
                                   }`}>{String.fromCharCode(65 + idx)}</span>
                                   <span className="leading-relaxed pt-0.5 text-inherit">{o}</span>
                                 </span>
                               </button>
                             );
                           })}
                        </div>
                      </div>
                      {selectedQuizOption && !showAnswer && (
                        <button onClick={() => setShowAnswer(true)} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 active:scale-[0.98] transition-all">Verify Selection</button>
                      )}
                      {showAnswer && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                          <div className={`p-8 rounded-2xl border-2 ${selectedQuizOption === activeQuizSet[currentQuizIndex]?.answer ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                            <p className="font-black text-lg mb-2">{selectedQuizOption === activeQuizSet[currentQuizIndex]?.answer ? 'Correct' : 'Incorrect'}</p>
                            <p className="text-sm font-semibold leading-relaxed">{activeQuizSet[currentQuizIndex]?.explanation || ''}</p>
                          </div>
                          <button onClick={() => {
                            const currentQ = activeQuizSet[currentQuizIndex];
                            if (!currentQ) return;
                            const isCorrect = selectedQuizOption === currentQ.answer;
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
                          }} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 active:scale-[0.98] transition-all">
                            {currentQuizIndex < activeQuizSet.length - 1 ? 'Next Question' : 'View Results'}
                          </button>
                        </div>
                      )}
                    </div>
                   )}
                 </>
               ) : quizFinished ? (
                 <div className="text-center space-y-12 animate-in zoom-in-95 duration-500">
                    <div className="w-32 h-32 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-6xl shadow-inner">🏆</div>
                    <div>
                      <h2 className="text-5xl font-black tracking-tighter text-slate-900">Session Optimized</h2>
                      <p className="text-slate-500 font-bold mt-4 text-xl">Verification Accuracy: {Math.round((quizScore / (activeQuizSet.length || 1)) * 100)}%</p>
                      <p className="text-slate-400 text-xs mt-2 uppercase font-black tracking-widest">{quizScore} correct out of {activeQuizSet.length}</p>
                    </div>
                    <button
                      onClick={finalizeSession}
                      disabled={isFinalizing || isFinalized}
                      className={`w-full py-7 rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl transition-all ${
                        isFinalizing || isFinalized
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95'
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
               <div className="flex-1 overflow-y-auto space-y-8 pb-20 custom-scrollbar pr-6">
                  {agent.chat_history.map((m, i) => (
                    <div key={i} className={`p-8 rounded-[2.5rem] text-sm font-bold shadow-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-600 text-white ml-24' : 'bg-white border-2 border-slate-100 mr-24 text-slate-800'}`}>
                       {m.text}
                    </div>
                  ))}
                  {isTyping && <div className="text-[10px] font-black text-indigo-600 animate-pulse uppercase tracking-widest ml-12">Neural Agent Processing...</div>}
               </div>
               <form onSubmit={handleSendMessage} className="pt-8 flex gap-5 bg-white sticky bottom-0 border-t mt-4 relative z-10">
                  <input type="text" placeholder="Query your neural tutor..." className="flex-1 px-10 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] outline-none font-black shadow-inner" value={chatInput} onChange={e => setChatInput(e.target.value)} />
                  <button type="submit" className="w-20 h-20 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black shadow-xl">↑</button>
               </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default StudySession;
