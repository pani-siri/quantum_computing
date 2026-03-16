
import React, { useState, useEffect, useRef } from 'react';
import { SubTopic, MasteryState, ChatMessage, LearningAgent, AcademicBundle, CognitiveLoadState, SolvedExample, MaterialItem, VideoItem, QuizItem, FlashcardItem, PracticeQuestion } from '../types';
import { fastapiService } from '../services/fastapiService';
import { BehavioralMetrics } from '../services/quantumSimulator';
import { extractNotesFeatures, extractPracticeFeatures, extractQuizFeatures, extractVideoFeatures } from '../services/qsvmFeatureExtractor';
import { ExternalLink, Youtube, FileText, BookOpen, PenTool, ClipboardCheck, ChevronDown, ChevronUp, Library, GraduationCap, CheckCircle2, HelpCircle, FileSearch, LibraryBig, Book, Layers, Download, Sparkles, Settings2, Eye, EyeOff } from 'lucide-react';
import ModuleFlashcard from './ModuleFlashcard';

interface StudySessionProps {
  subtopic: SubTopic;
  agent: LearningAgent;
  onComplete: (stats: { focusTime: number, distractions: number, bundle: AcademicBundle, loadState: CognitiveLoadState, quizScore?: number, wrongAnswers?: string[] }) => void;
  onExit: () => void;
  onUpdateChat: (messages: ChatMessage[]) => void;
}

const StudySession: React.FC<StudySessionProps> = ({ subtopic, agent, onComplete, onExit, onUpdateChat }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'notes' | 'materials' | 'practice' | 'flashcards' | 'quiz' | 'chat'>('video');
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

  // Flashcard State
  const [flashcardsStarted, setFlashcardsStarted] = useState(false);
  const [userDesiredFlashcards, setUserDesiredFlashcards] = useState(5);
  const [activeFlashcardSet, setActiveFlashcardSet] = useState<FlashcardItem[]>([]);
  const [currentFlashIndex, setCurrentFlashIndex] = useState(0);
  
  const [expandedSolved, setExpandedSolved] = useState<number | null>(null);
  const [showPracticeAnswers, setShowPracticeAnswers] = useState<Record<number, boolean>>({});

  const [isRegenerating, setIsRegenerating] = useState(false);
  const regenCooldownRef = useRef<Record<string, number>>({});
  const quizWrongStreakRef = useRef(0);
  const quizWrongAnswersRef = useRef<string[]>([]);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const notesSectionsRef = useRef<string[]>([]);
  const activeNotesSectionRef = useRef<number>(0);
  const notesSectionSecondsRef = useRef<Record<number, number>>({});
  const notesSectionScrollEventsRef = useRef<Record<number, number>>({});
  const practiceRevealCountsRef = useRef<Record<number, number>>({});
  const practiceQuestionStartAtRef = useRef<Record<number, number>>({});

  const quizQuestionStartAtRef = useRef<number>(Date.now());
  const quizRetriesRef = useRef<number>(0);

  const videoTabSecondsRef = useRef(0);
  const videoClicksRef = useRef<Record<number, number>>({});

  const timerRef = useRef<any>(null);

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

      if (bundle?.solved_examples && bundle.solved_examples.length > 0) {
        const solvedText = bundle.solved_examples
          .map((ex, idx) => `Example ${idx + 1}: ${ex.problem}\nSolution: ${ex.solution}\nSteps: ${ex.steps.join(' -> ')}`)
          .join('\n\n');
        contextChunks.push(`SOLVED EXAMPLES:\n${solvedText}`);
      }

      if (bundle?.practice_questions && bundle.practice_questions.length > 0) {
        const practiceText = bundle.practice_questions
          .map((q, idx) => `Practice ${idx + 1}: ${typeof q === 'string' ? q : q.question}\nAnswer: ${typeof q === 'string' ? '' : q.answer}`)
          .join('\n\n');
        contextChunks.push(`PRACTICE QUESTIONS:\n${practiceText}`);
      }

      if (bundle?.flashcards && bundle.flashcards.length > 0) {
        const flashText = bundle.flashcards
          .map((fc, idx) => `Card ${idx + 1}: Q: ${fc.front}\nA: ${fc.back}`)
          .join('\n\n');
        contextChunks.push(`FLASHCARDS:\n${flashText}`);
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

  const handleStartFlashcards = () => {
    if (!bundle?.flashcards) return;
    const shuffled = [...bundle.flashcards].sort(() => 0.5 - Math.random());
    const sliced = shuffled.slice(0, Math.min(userDesiredFlashcards, bundle.flashcards.length));
    setActiveFlashcardSet(sliced);
    setFlashcardsStarted(true);
    setCurrentFlashIndex(0);
  };

  const isCooldownActive = (key: string, ms: number) => {
    const last = regenCooldownRef.current[key] || 0;
    return Date.now() - last < ms;
  };

  const markCooldown = (key: string) => {
    regenCooldownRef.current[key] = Date.now();
  };

  const simplifyResource = async (args: {
    resourceType: 'notes_snippet' | 'video_item' | 'practice_question' | 'quiz_item';
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

        if (args.resourceType === 'practice_question' && typeof args.index === 'number') {
          const list = Array.isArray(next.practice_questions) ? [...next.practice_questions] : [];
          if (list[args.index] && res.resource?.question) {
            list[args.index] = { question: res.resource.question, answer: res.resource.answer };
            next.practice_questions = list;
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
    onComplete({ focusTime, distractions, bundle: bundle!, loadState, quizScore: quizScorePercent, wrongAnswers: quizWrongAnswersRef.current.length > 0 ? quizWrongAnswersRef.current : undefined });
  };

  const getEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
    return url;
  };

  const togglePracticeAnswer = (idx: number) => {
    setShowPracticeAnswers(prev => {
      const nextValue = !prev[idx];
      const next = { ...prev, [idx]: nextValue };

      if (nextValue) {
        if (!practiceQuestionStartAtRef.current[idx]) practiceQuestionStartAtRef.current[idx] = Date.now();
        const count = (practiceRevealCountsRef.current[idx] || 0) + 1;
        practiceRevealCountsRef.current[idx] = count;

        const startedAt = practiceQuestionStartAtRef.current[idx] || Date.now();
        const responseTimeSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const metrics: BehavioralMetrics = extractPracticeFeatures({
          response_time_sec: responseTimeSec,
          reveal_count: count,
          max_expected_reveals: 4
        });
        if (!isCooldownActive(`practice_auto_${idx}`, 45_000)) {
          markCooldown(`practice_auto_${idx}`);
          simplifyResource({
            resourceType: 'practice_question',
            index: idx,
            current: bundle?.practice_questions?.[idx],
            cooldownKey: `practice_auto_${idx}`,
            metrics
          });
          practiceRevealCountsRef.current[idx] = 0;
          practiceQuestionStartAtRef.current[idx] = Date.now();
        }
      }

      return next;
    });
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
      <header className="h-20 border-b flex items-center justify-between px-8 bg-white shrink-0 relative z-20 shadow-sm">
        <div className="flex items-center gap-5">
          <button onClick={onExit} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-full transition-all border shadow-sm">✕</button>
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
           <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <GraduationCap size={20} />
           </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-24 border-r flex flex-col items-center py-10 gap-8 bg-slate-50 shrink-0 overflow-y-auto no-scrollbar relative z-10">
           {[
             { id: 'video', label: 'Watch', icon: <Youtube size={22}/> },
             { id: 'notes', label: 'Read', icon: <BookOpen size={22}/> },
             { id: 'materials', label: 'Library', icon: <LibraryBig size={22}/> },
             { id: 'practice', label: 'Lab', icon: <PenTool size={22}/> },
             { id: 'flashcards', label: 'Cards', icon: <ClipboardCheck size={22}/> },
             { id: 'quiz', label: 'Quiz', icon: <CheckCircle2 size={22}/> },
             { id: 'chat', label: 'Tutor', icon: <GraduationCap size={22}/> }
           ].map(t => (
             <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center gap-2 group transition-all ${activeTab === t.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
               <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-xl rotate-2' : 'bg-white border shadow-sm group-hover:border-indigo-200'}`}>
                 {t.icon}
               </div>
               <span className="text-[9px] font-black uppercase tracking-widest scale-90 transition-transform">{t.label}</span>
             </button>
           ))}
        </aside>

        <main
          ref={(el) => { mainScrollRef.current = el; }}
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto p-12 bg-white relative custom-scrollbar"
        >
          {activeTab === 'video' && (
            <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-500">
               <div className="flex justify-between items-end border-b pb-8">
                  <div>
                    <h3 className="text-4xl font-black italic tracking-tighter">Visual Hub</h3>
                    <p className="text-slate-500 font-medium mt-1">Video deep-dives for {subtopic.title}.</p>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {bundle?.videos.map((v, i) => (
                    <div key={i} className="group bg-slate-50 p-8 rounded-[3rem] border-2 border-slate-100 hover:border-indigo-400 transition-all shadow-sm">
                      <div className="aspect-video bg-slate-900 rounded-[2rem] overflow-hidden mb-8 relative border-4 border-white shadow-xl">
                        <iframe className="w-full h-full" src={getEmbedUrl(v.url)} title={v.title} frameBorder="0" allowFullScreen></iframe>
                      </div>
                      <h4 className="font-black text-xl mb-3 leading-tight">{v.title}</h4>
                      <p className="text-xs text-slate-500 mb-8 leading-relaxed line-clamp-2">{v.description}</p>
                      <a onClick={() => handleVideoSourceClick(i)} href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 w-full py-4 bg-indigo-600 text-white rounded-2xl justify-center text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg group">
                        Source Stream <ExternalLink size={16} className="group-hover:translate-x-1 transition-transform"/>
                      </a>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="max-w-3xl mx-auto academic-content pb-24 animate-in fade-in duration-500">
              <h2 className="text-5xl font-black mb-10 tracking-tighter leading-tight">Mastery Notes</h2>
              <div className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 shadow-inner leading-relaxed" dangerouslySetInnerHTML={{ __html: bundle?.notes.replace(/\n/g, '<br/>') || '' }} />
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-500">
              <div className="border-b pb-8 flex justify-between items-end">
                <div>
                  <h3 className="text-4xl font-black italic tracking-tighter">Reference Library</h3>
                  <p className="text-slate-500 font-medium mt-1">Topic-specific textbooks and readable PDF guides.</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><LibraryBig size={28} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {bundle?.materials && bundle.materials.length > 0 ? (
                  bundle.materials.map((m, i) => (
                    <div key={i} className="p-10 bg-slate-50 border-2 border-slate-100 rounded-[3.5rem] hover:border-indigo-500 transition-all group flex flex-col shadow-sm">
                      <div className="w-16 h-16 rounded-3xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 mb-8 shadow-sm group-hover:shadow-md transition-all">
                        {m.type === 'pdf' ? <FileSearch size={28}/> : m.type === 'textbook' ? <BookOpen size={28}/> : <FileText size={28}/>}
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[10px] font-black uppercase bg-indigo-600 text-white px-3 py-1 rounded-full">{m.type}</span>
                        <Sparkles size={14} className="text-amber-500" />
                      </div>
                      <h4 className="text-2xl font-black mb-3 leading-tight text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">{m.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed mb-10 flex-1 line-clamp-3">{m.description}</p>
                      <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 w-full py-4 bg-white border-2 border-slate-100 rounded-2xl justify-center text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                        Open Textbook <ExternalLink size={14}/>
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 py-24 flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3.5rem] text-slate-400">
                    <FileSearch size={48} className="mb-4 animate-pulse opacity-20" />
                    <p className="font-bold">Locating high-relevance textbooks and PDF resources...</p>
                  </div>
                )}
              </div>
              <div className="p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] flex items-center gap-6">
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shrink-0"><Book size={24}/></div>
                <div>
                   <p className="text-sm font-black text-indigo-900">Digital Library Active</p>
                   <p className="text-xs font-bold text-indigo-700/70">These resources are curated from open-source educational repositories (OER) specifically for {subtopic.title}.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'practice' && (
            <div className="max-w-4xl mx-auto space-y-16 pb-24 animate-in fade-in duration-500">
               <div className="border-b pb-8 flex justify-between items-end">
                  <div>
                    <h3 className="text-4xl font-black italic tracking-tighter">Practice Lab</h3>
                    <p className="text-slate-500 font-medium mt-1">Bridging theory and application through logical exercises.</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600"><Layers size={28} /></div>
               </div>

               <div className="space-y-8">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500" /> Solved Logic Walkthroughs
                  </h4>
                  <div className="space-y-6">
                    {bundle?.solved_examples?.map((ex, i) => (
                      <div key={i} className="bg-white border-2 border-slate-100 rounded-[3.5rem] overflow-hidden shadow-sm transition-all hover:shadow-xl">
                        <button 
                          onClick={() => setExpandedSolved(expandedSolved === i ? null : i)}
                          className="w-full p-10 text-left flex justify-between items-center hover:bg-slate-50 transition-all"
                        >
                          <span className="font-black text-2xl tracking-tight text-slate-900 pr-10">{ex.problem}</span>
                          <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${expandedSolved === i ? 'bg-indigo-600 border-indigo-600 text-white rotate-180' : 'bg-white border-slate-100 text-slate-400'}`}> 
                             <ChevronDown size={24}/>
                          </div>
                        </button>
                        {expandedSolved === i && (
                          <div className="p-12 bg-slate-50 border-t border-slate-100 space-y-10 animate-in slide-in-from-top-6 duration-300">
                            <div className="space-y-8 relative before:absolute before:inset-y-0 before:left-4 before:w-0.5 before:bg-indigo-100">
                              <p className="text-[11px] font-black uppercase text-indigo-500 tracking-widest ml-10">Logical Steps:</p>
                              {ex.steps.map((step, sIdx) => (
                                <div key={sIdx} className="flex gap-6 relative z-10">
                                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 text-xs font-black text-indigo-600 border-2 border-indigo-100 shadow-sm">
                                    {sIdx + 1}
                                  </div>
                                  <p className="text-base font-bold text-slate-700 pt-1 leading-relaxed">{step}</p>
                                </div>
                              ))}
                            </div>
                            <div className="p-8 bg-emerald-50 border-2 border-emerald-100 rounded-[2rem] shadow-sm">
                              <p className="text-[11px] font-black uppercase text-emerald-600 mb-2 tracking-widest">Mastery Result:</p>
                              <p className="text-xl font-black text-slate-900 italic">"{ex.solution}"</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
               </div>

               <div className="space-y-8">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <HelpCircle size={16} className="text-indigo-500" /> Independent Challenges
                  </h4>
                  <div className="grid grid-cols-1 gap-6">
                    {bundle?.practice_questions?.map((q, i) => (
                      <div key={i} className="p-10 bg-slate-50 border-2 border-white shadow-xl rounded-[2.5rem] flex flex-col gap-6 hover:scale-[1.01] transition-transform overflow-hidden">
                         <div className="flex gap-8 items-start">
                           <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black shrink-0 shadow-lg text-lg">
                             {i + 1}
                           </div>
                           <div className="flex-1 space-y-4 pt-2">
                             <p className="text-xl font-black text-slate-800 leading-snug italic">{typeof q === 'string' ? q : q.question}</p>
                             <button 
                               onClick={() => togglePracticeAnswer(i)}
                               className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:border-indigo-600 transition-all shadow-sm"
                             >
                               {showPracticeAnswers[i] ? <EyeOff size={14}/> : <Eye size={14}/>}
                               {showPracticeAnswers[i] ? 'Hide Answers' : 'Answers'}
                             </button>
                           </div>
                         </div>
                         {showPracticeAnswers[i] && typeof q !== 'string' && (
                           <div className="p-8 bg-indigo-50 border border-indigo-100 rounded-[2rem] animate-in slide-in-from-top-4 duration-300">
                              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-2">Solution Insight:</p>
                              <p className="font-bold text-indigo-900 leading-relaxed whitespace-pre-wrap">{q.answer}</p>
                           </div>
                         )}
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'flashcards' && (
            <div className="max-w-xl mx-auto h-full flex flex-col justify-center animate-in zoom-in-95 duration-500">
               {bundle?.flashcards && (
                 <>
                   {!flashcardsStarted ? (
                     <div className="space-y-12 animate-in zoom-in-95 duration-500 text-center">
                       <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-indigo-600 shadow-inner">
                         <Settings2 size={48} />
                       </div>
                       <div>
                         <h3 className="text-4xl font-black tracking-tighter">Personalized Recall</h3>
                         <p className="text-slate-500 font-medium mt-2">Choose the number of flashcards for your focus session.</p>
                       </div>
                       
                       <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-slate-100 space-y-8">
                         <div className="flex flex-col items-center">
                           <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Select Card Count</label>
                           <div className="flex items-center gap-6">
                             <button 
                               onClick={() => setUserDesiredFlashcards(Math.max(1, userDesiredFlashcards - 1))}
                               className="w-12 h-12 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center font-black text-xl hover:bg-slate-50 active:scale-90 transition-all shadow-sm"
                             >-</button>
                             <div className="flex flex-col items-center">
                               <span className="text-6xl font-black italic text-indigo-600 w-24 text-center">{userDesiredFlashcards}</span>
                               <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Cards</span>
                             </div>
                             <button 
                               onClick={() => setUserDesiredFlashcards(Math.min(bundle.flashcards.length, userDesiredFlashcards + 1))}
                               className="w-12 h-12 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center font-black text-xl hover:bg-slate-50 active:scale-90 transition-all shadow-sm"
                             >+</button>
                           </div>
                           <p className="text-[10px] font-bold text-slate-400 mt-6 uppercase tracking-widest">Available from Pool: {bundle.flashcards.length}</p>
                         </div>
                       </div>

                       <button 
                         onClick={handleStartFlashcards}
                         className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all"
                       >
                         Start Neural Recall
                       </button>
                     </div>
                   ) : (
                    <div className="space-y-12">
                      <div className="text-center">
                        <h3 className="text-3xl font-black mb-2 italic">Neural Recall</h3>
                        <p className="text-slate-500 font-medium">Verify your long-term memory of core concepts.</p>
                      </div>
                      <ModuleFlashcard 
                        question={activeFlashcardSet[currentFlashIndex]?.front || ''} 
                        answer={activeFlashcardSet[currentFlashIndex]?.back || ''} 
                      />
                      <div className="flex justify-between items-center px-10">
                        <button disabled={currentFlashIndex === 0} onClick={() => setCurrentFlashIndex(prev => prev - 1)} className="text-[11px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30">← Prev</button>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Card {currentFlashIndex + 1} / {activeFlashcardSet.length}</span>
                        <button disabled={currentFlashIndex === activeFlashcardSet.length - 1} onClick={() => setCurrentFlashIndex(prev => prev + 1)} className="text-[11px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30">Next →</button>
                      </div>
                    </div>
                   )}
                 </>
               )}
            </div>
          )}

          {activeTab === 'quiz' && (
            <div className="max-w-2xl mx-auto h-full flex flex-col justify-center animate-in fade-in duration-500">
               {bundle?.quiz && !quizFinished ? (
                 <>
                   {!quizStarted ? (
                     <div className="space-y-12 animate-in zoom-in-95 duration-500 text-center">
                       <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-indigo-600 shadow-inner">
                         <Settings2 size={48} />
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
                      <div className="p-12 border-2 border-slate-100 rounded-[3.5rem] bg-white shadow-2xl relative">
                        <div className="absolute -top-6 left-12 px-6 py-2 bg-slate-900 text-white text-[10px] font-black uppercase rounded-full">
                          Assessing: Question {currentQuizIndex + 1} of {activeQuizSet.length}
                        </div>
                        <p className="text-2xl font-black mb-12 tracking-tight leading-tight">{activeQuizSet[currentQuizIndex]?.question}</p>
                        <div className="space-y-4">
                           {activeQuizSet[currentQuizIndex]?.options.map((o, idx) => (
                             <button key={idx} onClick={() => !showAnswer && setSelectedQuizOption(o)} className={`w-full text-left p-6 rounded-3xl border-2 font-bold text-lg transition-all ${selectedQuizOption === o ? 'border-indigo-600 bg-indigo-50 shadow-inner' : 'border-slate-100 hover:bg-slate-50'}`}>
                               {o}
                             </button>
                         ))}
                        </div>
                      </div>
                      {selectedQuizOption && !showAnswer && (
                        <button onClick={() => setShowAnswer(true)} className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-xl">Verify Selection</button>
                      )}
                      {showAnswer && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-8">
                          <div className={`p-10 rounded-[3rem] border-2 shadow-sm ${selectedQuizOption === activeQuizSet[currentQuizIndex]?.answer ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
                            <p className="font-black text-xl mb-3">{selectedQuizOption === activeQuizSet[currentQuizIndex]?.answer ? '✓ Positive match' : '✗ Incorrect branch'}</p>
                            <p className="text-base font-bold opacity-80 leading-relaxed">{activeQuizSet[currentQuizIndex]?.explanation || ''}</p>
                          </div>
                          <button onClick={() => {
                            const currentQ = activeQuizSet[currentQuizIndex];
                            if (!currentQ) return;
                            const isCorrect = selectedQuizOption === currentQ.answer;
                            if (isCorrect) setQuizScore(s => s + 1);

                            // Track wrong answers for revision injection
                            if (!isCorrect) {
                              quizWrongAnswersRef.current.push(
                                `Q: ${currentQ.question} | Correct: ${currentQ.answer} | Explanation: ${currentQ.explanation || 'N/A'}`
                              );
                            }

                            // Always move forward — don't trap user on wrong answer
                            if (currentQuizIndex < activeQuizSet.length - 1) {
                              setCurrentQuizIndex(i => i + 1);
                              setSelectedQuizOption(null);
                              setShowAnswer(false);
                              quizQuestionStartAtRef.current = Date.now();
                            } else {
                              setQuizFinished(true);
                            }
                          }} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase tracking-widest">Next Branch</button>
                        </div>
                      )}
                    </div>
                   )}
                 </>
               ) : quizFinished ? (
                 <div className="text-center space-y-12 animate-in zoom-in-95 duration-500">
                    <div className="w-32 h-32 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-6xl shadow-inner">🏆</div>
                    <div>
                      <h2 className="text-5xl font-black tracking-tighter">Session Optimized</h2>
                      <p className="text-slate-500 font-bold mt-4 text-xl">Verification Accuracy: {Math.round((quizScore / (activeQuizSet.length || 1)) * 100)}%</p>
                      <p className="text-slate-400 text-xs mt-2 uppercase font-black tracking-widest">{quizScore} correct out of {activeQuizSet.length}</p>
                    </div>
                    <button onClick={finalizeSession} className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl">Finalize Mastery</button>
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
