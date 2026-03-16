
import React, { useState } from 'react';
import { LearningAgent, FinalAssessment, QuizItem, SubjectiveItem } from '../types';
import { generateFinalAssessment, evaluateFinalAssessment } from '../services/geminiService';
import { GraduationCap, CheckCircle2, AlertCircle, Send, ChevronRight, Trophy, BookOpen } from 'lucide-react';

interface Props {
  agent: LearningAgent;
  onComplete: (result: { score: number, feedback: string, weak_areas: string[] }) => void;
  onClose: () => void;
}

const FinalAssessmentView: React.FC<Props> = ({ agent, onComplete, onClose }) => {
  const [assessment, setAssessment] = useState<FinalAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<'intro' | 'objective' | 'subjective' | 'result'>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<number, string>>({});
  const [subjectiveAnswers, setSubjectiveAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<{ score: number, feedback: string, weak_areas: string[] } | null>(null);

  const startAssessment = async () => {
    setLoading(true);
    try {
      const data = await generateFinalAssessment(agent.subject, agent.syllabus || 'Standard mastery path');
      setAssessment(data);
      setStage('objective');
    } catch (e) {
      alert("Failed to synthesize assessment nodes.");
    } finally {
      setLoading(false);
    }
  };

  const handleObjectiveNext = () => {
    if (currentIdx < (assessment?.objective_questions.length || 0) - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setStage('subjective');
      setCurrentIdx(0);
    }
  };

  const submitFinal = async () => {
    setSubmitting(true);
    try {
      const objResults = assessment!.objective_questions.map((q, idx) => ({
        question: q.question,
        score: objectiveAnswers[idx] === q.answer ? 1 : 0
      }));
      const subjResults = assessment!.subjective_questions.map((q, idx) => ({
        question: q.question,
        answer: subjectiveAnswers[idx] || ''
      }));

      const result = await evaluateFinalAssessment(agent.subject, objResults, subjResults);
      setEvalResult(result);
      setStage('result');
      onComplete(result);
    } catch (e) {
      alert("Evaluation engine failure.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 bg-white z-[300] flex flex-col items-center justify-center p-10 text-center">
      <div className="w-16 h-16 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mb-8"></div>
      <h2 className="text-3xl font-black italic tracking-tighter">Generating Mastery Node...</h2>
      <p className="text-slate-500 font-medium mt-3">Compiling 30 rigorous objective and subjective challenges.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-white z-[250] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500">
      <header className="h-20 border-b flex items-center justify-between px-8 bg-white shrink-0 relative z-20 shadow-sm">
        <div className="flex items-center gap-5">
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-full transition-all border shadow-sm text-slate-400">✕</button>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none uppercase">{agent.subject}: Mastery Exam</h1>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Final Performance Validation</p>
          </div>
        </div>
        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
          <Trophy size={20} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-12 bg-white relative custom-scrollbar">
        <div className="max-w-3xl mx-auto h-full">
          {stage === 'intro' && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in zoom-in-95 duration-500">
               <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 shadow-inner">
                 <GraduationCap size={48} />
               </div>
               <div>
                 <h2 className="text-5xl font-black tracking-tighter leading-tight">Mastery Awaits</h2>
                 <p className="text-slate-500 font-bold mt-4 max-w-lg mx-auto leading-relaxed">
                   This assessment consists of 30 questions designed to validate your total understanding of the syllabus. 
                   You will encounter both objective choices and subjective application tasks.
                 </p>
               </div>
               <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left">
                    <p className="text-2xl font-black italic">20</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Objective</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left">
                    <p className="text-2xl font-black italic">10</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subjective</p>
                  </div>
               </div>
               <button onClick={startAssessment} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl hover:bg-black transition-all">Start Final Node</button>
            </div>
          )}

          {stage === 'objective' && assessment && (
            <div className="space-y-12 animate-in fade-in duration-500">
              <div className="flex justify-between items-center border-b pb-6">
                 <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Part 1: Objective Logic</span>
                 <span className="text-sm font-black italic text-slate-400">Q{currentIdx + 1} / 20</span>
              </div>
              <div className="p-12 border-2 border-slate-100 rounded-[3.5rem] bg-white shadow-2xl">
                 <h3 className="text-2xl font-black tracking-tight leading-tight mb-12">{assessment.objective_questions[currentIdx].question}</h3>
                 <div className="space-y-4">
                    {assessment.objective_questions[currentIdx].options.map((opt, i) => (
                      <button 
                        key={i} 
                        onClick={() => setObjectiveAnswers({...objectiveAnswers, [currentIdx]: opt})}
                        className={`w-full text-left p-6 rounded-3xl border-2 font-bold text-lg transition-all ${objectiveAnswers[currentIdx] === opt ? 'border-indigo-600 bg-indigo-50 shadow-inner' : 'border-slate-100 hover:bg-slate-50'}`}
                      >
                        {opt}
                      </button>
                    ))}
                 </div>
              </div>
              <button onClick={handleObjectiveNext} disabled={!objectiveAnswers[currentIdx]} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-xl disabled:opacity-30">
                 {currentIdx === 19 ? 'Next Part' : 'Confirm & Continue'}
              </button>
            </div>
          )}

          {stage === 'subjective' && assessment && (
            <div className="space-y-12 animate-in fade-in duration-500">
              <div className="flex justify-between items-center border-b pb-6">
                 <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Part 2: Synthesis & Application</span>
                 <span className="text-sm font-black italic text-slate-400">Q{currentIdx + 1} / 10</span>
              </div>
              <div className="p-12 border-2 border-slate-100 rounded-[3.5rem] bg-white shadow-2xl">
                 <h3 className="text-2xl font-black tracking-tight leading-tight mb-8">{assessment.subjective_questions[currentIdx].question}</h3>
                 <textarea 
                   className="w-full h-48 p-8 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-lg focus:border-indigo-500 shadow-inner"
                   placeholder="Synthesize your comprehensive response here..."
                   value={subjectiveAnswers[currentIdx] || ''}
                   onChange={e => setSubjectiveAnswers({...subjectiveAnswers, [currentIdx]: e.target.value})}
                 />
              </div>
              <div className="flex gap-4">
                 <button disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)} className="flex-1 py-7 bg-slate-100 text-slate-600 rounded-[2.5rem] font-black uppercase tracking-widest">Previous</button>
                 {currentIdx < 9 ? (
                   <button onClick={() => setCurrentIdx(currentIdx + 1)} className="flex-[2] py-7 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-xl">Next Challenge</button>
                 ) : (
                   <button onClick={submitFinal} disabled={submitting} className="flex-[2] py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl">
                     {submitting ? 'Evaluating Performance...' : 'Final Submission'}
                   </button>
                 )}
              </div>
            </div>
          )}

          {stage === 'result' && evalResult && (
            <div className="space-y-12 animate-in zoom-in-95 duration-500 text-center">
               <div className="w-32 h-32 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-6xl shadow-inner mb-6">🏆</div>
               <div>
                 <h2 className="text-5xl font-black tracking-tighter">Mastery Analysis Complete</h2>
                 <p className="text-slate-500 font-bold mt-2">Combined Logic & Synthesis Score</p>
               </div>
               
               <div className="text-8xl font-black italic text-indigo-600">{evalResult.score}%</div>

               <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-slate-100 text-left space-y-8">
                  <div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">Neural Feedback</p>
                    <p className="text-lg font-bold text-slate-700 leading-relaxed italic">"{evalResult.feedback}"</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4">Weak Nodes (Review Suggested)</p>
                    <div className="flex flex-wrap gap-3">
                       {evalResult.weak_areas.map((area, i) => (
                         <span key={i} className="px-5 py-2 bg-white border border-rose-100 rounded-full text-xs font-black text-rose-600">{area}</span>
                       ))}
                    </div>
                  </div>
               </div>

               <button onClick={onClose} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl">Finalize Mastery Node</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default FinalAssessmentView;
