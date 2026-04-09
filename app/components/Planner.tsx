
import React, { useState, useMemo, useEffect } from 'react';
import { Task, ScheduleEvent, LearningAgent, User } from '../types';
import { Clock, Settings2, Bell, BellOff, ChevronRight, Calendar, Mail, Loader2, CheckCircle2, AlertTriangle, X, Plus } from 'lucide-react';
import { firebaseService } from '../services/firebaseService';

interface GmailDeadline {
  title: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
  from: string;
  emailDate: string;
  extractedDateStr: string;
  selected?: boolean;
}

interface PlannerProps {
  tasks: Task[];
  schedule: ScheduleEvent[];
  agents: LearningAgent[];
  currentUser: User | null;
  onStartSession: (agentId: string, subtopicId: string) => void;
  onUpdateSchedule: (updated: ScheduleEvent[]) => void;
  onUpdateTasks: (updated: Task[]) => void;
}

const Planner: React.FC<PlannerProps> = ({ tasks, schedule, agents, currentUser, onStartSession, onUpdateSchedule, onUpdateTasks }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showScheduler, setShowScheduler] = useState(false);
  const [studyHour, setStudyHour] = useState(() => {
    const first = schedule.find(e => e.type === 'study');
    return first ? new Date(first.start_time).getHours() : 10;
  });
  const [studyMinute, setStudyMinute] = useState(() => {
    const first = schedule.find(e => e.type === 'study');
    return first ? new Date(first.start_time).getMinutes() : 0;
  });
  const [sessionDuration, setSessionDuration] = useState(() => {
    const first = schedule.find(e => e.type === 'study');
    if (first) {
      const diff = (new Date(first.end_time).getTime() - new Date(first.start_time).getTime()) / 60000;
      return Math.round(diff) || 120;
    }
    return 120;
  });

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState(60);
  const [reminderSaving, setReminderSaving] = useState(false);

  // Gmail extraction state
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailDeadlines, setGmailDeadlines] = useState<GmailDeadline[]>([]);
  const [gmailAdding, setGmailAdding] = useState(false);
  const [gmailSuccess, setGmailSuccess] = useState(false);

  useEffect(() => {
    if (currentUser?.uid) {
      firebaseService.getReminderPrefs(currentUser.uid).then(prefs => {
        setReminderEnabled(prefs.enabled);
        setReminderMinutes(prefs.minutesBefore);
      }).catch(() => {});
    }
  }, [currentUser?.uid]);

  const saveReminderPrefs = async (enabled: boolean, minutes: number) => {
    if (!currentUser?.uid) return;
    setReminderSaving(true);
    try {
      const updated = await firebaseService.saveReminderPrefs(currentUser.uid, { enabled, minutesBefore: minutes });
      setReminderEnabled(updated.enabled);
      setReminderMinutes(updated.minutesBefore);
    } catch (e) {
      console.error('Failed to save reminder prefs:', e);
    } finally {
      setReminderSaving(false);
    }
  };

  // ── Gmail Extraction Handler ─────────────────────────────────────────────
  const handleExtractGmail = async () => {
    setShowGmailModal(true);
    setGmailLoading(true);
    setGmailError(null);
    setGmailDeadlines([]);
    setGmailSuccess(false);

    try {
      const deadlines = await firebaseService.extractGmailDeadlines();
      
      // Filter out deadlines that are already past
      const now = new Date();
      const futureDeadlines = deadlines.filter(d => new Date(d.deadline) > now);
      
      // Mark all as selected by default
      setGmailDeadlines(futureDeadlines.map(d => ({ ...d, selected: true })));
      
      if (futureDeadlines.length === 0 && deadlines.length > 0) {
        setGmailError("Found deadlines in emails, but they're all in the past.");
      } else if (futureDeadlines.length === 0) {
        setGmailError("No deadline-related emails found in the last 30 days.");
      }
    } catch (err: any) {
      setGmailError(err.message || "Failed to connect to Gmail. Check server configuration.");
    } finally {
      setGmailLoading(false);
    }
  };

  const toggleDeadlineSelection = (idx: number) => {
    setGmailDeadlines(prev => prev.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d));
  };

  const handleAddSelectedDeadlines = async () => {
    if (!currentUser?.uid) return;
    const selected = gmailDeadlines.filter(d => d.selected);
    if (selected.length === 0) return;

    setGmailAdding(true);
    try {
      // Create task entries
      const newTasks: Task[] = selected.map(d => ({
        id: `gmail_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        user_id: currentUser!.uid,
        title: d.title,
        deadline: d.deadline,
        priority: d.priority,
        source: 'Email' as const
      }));

      // Create schedule events for each deadline
      const newEvents: ScheduleEvent[] = selected.map(d => {
        const deadlineDate = new Date(d.deadline);
        deadlineDate.setHours(23, 59, 0, 0);
        const startDate = new Date(deadlineDate);
        startDate.setHours(deadlineDate.getHours() - 1);
        
        return {
          id: `gmail_evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          user_id: currentUser!.uid,
          title: `📧 Deadline: ${d.title}`,
          start_time: startDate.toISOString(),
          end_time: deadlineDate.toISOString(),
          type: 'deadline' as const
        };
      });

      // Save tasks
      const updatedTasks = [...tasks, ...newTasks];
      await firebaseService.saveTasks(currentUser!.uid, updatedTasks);
      onUpdateTasks(updatedTasks);
      
      // Update schedule
      const updatedSchedule = [...schedule, ...newEvents];
      onUpdateSchedule(updatedSchedule);

      setGmailSuccess(true);
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        setShowGmailModal(false);
        setGmailSuccess(false);
        setGmailDeadlines([]);
      }, 2000);
    } catch (err: any) {
      setGmailError(err.message || "Failed to add deadlines to scheduler.");
    } finally {
      setGmailAdding(false);
    }
  };

  const dates = useMemo(() => {
    const arr = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const selectedDayEvents = useMemo(() => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return schedule.filter(e => {
      const d = new Date(e.start_time);
      return d >= start && d <= end;
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [selectedDate, schedule]);

  const formatDateLabel = (date: Date) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    if (date.getTime() === today.getTime()) return "Today";
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatTime = (h: number, m: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const applyScheduleChange = () => {
    const updated = schedule.map(e => {
      if (e.type !== 'study') return e;
      const old = new Date(e.start_time);
      const newStart = new Date(old);
      newStart.setHours(studyHour, studyMinute, 0, 0);
      const newEnd = new Date(newStart.getTime() + sessionDuration * 60000);
      return { ...e, start_time: newStart.toISOString(), end_time: newEnd.toISOString() };
    });
    onUpdateSchedule(updated);
    setShowScheduler(false);
  };

  const dayEventCount = (date: Date) => {
    const start = new Date(date); start.setHours(0,0,0,0);
    const end = new Date(date); end.setHours(23,59,59,999);
    return schedule.filter(e => { const d = new Date(e.start_time); return d >= start && d <= end; }).length;
  };

  const inputClass = "w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#e8e4dc] font-medium text-sm outline-none focus:border-[#c4b998]/40 transition-colors";

  const selectedCount = gmailDeadlines.filter(d => d.selected).length;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 p-6 md:p-10 max-w-7xl mx-auto w-full">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#e8e4dc] tracking-tight">Schedule</h2>
          <p className="text-sm md:text-base text-white/30 mt-1">{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Gmail Extraction Button */}
          <button
            id="gmail-extract-btn"
            onClick={handleExtractGmail}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold transition-all border bg-gradient-to-r from-[#ea4335]/10 to-[#fbbc05]/10 text-[#ea4335] border-[#ea4335]/20 hover:from-[#ea4335]/20 hover:to-[#fbbc05]/20 hover:border-[#ea4335]/30 hover:shadow-lg hover:shadow-[#ea4335]/5"
          >
            <Mail size={16} />
            <span className="hidden sm:inline">Gmail Deadlines</span>
            <span className="sm:hidden">Gmail</span>
          </button>
          <button
            onClick={() => setShowScheduler(!showScheduler)}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold transition-all border ${
              showScheduler
                ? 'bg-[#c4b998] text-[#111113] border-transparent shadow-lg shadow-[#c4b998]/15'
                : 'bg-white/[0.04] text-white/50 border-white/[0.08] hover:bg-white/[0.08] hover:text-[#e8e4dc]'
            }`}
          >
            <Settings2 size={16} />
            Settings
          </button>
        </div>
      </div>

      {/* ── Gmail Extraction Modal ─────────────────────────────── */}
      {showGmailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !gmailLoading && !gmailAdding && setShowGmailModal(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Modal */}
          <div 
            className="relative w-full max-w-2xl max-h-[85vh] bg-[#1a1a1e] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ea4335]/15 to-[#fbbc05]/15 border border-[#ea4335]/20 flex items-center justify-center">
                    <Mail size={20} className="text-[#ea4335]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#e8e4dc]">Gmail Deadline Extraction</h3>
                    <p className="text-xs text-white/30 mt-0.5">Scanning recent emails for deadlines</p>
                  </div>
                </div>
                <button 
                  onClick={() => !gmailLoading && !gmailAdding && setShowGmailModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Loading State */}
              {gmailLoading && (
                <div className="flex flex-col items-center justify-center py-16 space-y-5">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ea4335]/10 to-[#4285f4]/10 border border-[#ea4335]/15 flex items-center justify-center">
                      <Loader2 size={28} className="text-[#ea4335] animate-spin" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#fbbc05] rounded-full animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-[#e8e4dc]">Scanning your inbox...</p>
                    <p className="text-sm text-white/30 mt-1">Checking last 30 days for deadlines</p>
                  </div>
                  {/* Animated progress dots */}
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div 
                        key={i} 
                        className="w-2 h-2 rounded-full bg-[#ea4335]/40"
                        style={{ animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Success State */}
              {gmailSuccess && (
                <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-in zoom-in-95 duration-300">
                  <div className="w-16 h-16 rounded-2xl bg-[#8baa6e]/10 border border-[#8baa6e]/20 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-[#8baa6e]" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#e8e4dc]">Deadlines Added!</p>
                    <p className="text-sm text-white/30 mt-1">{selectedCount} deadline{selectedCount !== 1 ? 's' : ''} added to your scheduler</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {!gmailLoading && gmailError && gmailDeadlines.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#c97070]/10 border border-[#c97070]/15 flex items-center justify-center">
                    <AlertTriangle size={28} className="text-[#c97070]" />
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="text-base font-semibold text-[#e8e4dc]">No Deadlines Found</p>
                    <p className="text-sm text-white/30 mt-2">{gmailError}</p>
                  </div>
                  <button
                    onClick={handleExtractGmail}
                    className="mt-2 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-medium text-white/50 hover:bg-white/[0.08] hover:text-[#e8e4dc] transition-all"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Results */}
              {!gmailLoading && !gmailSuccess && gmailDeadlines.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-white/40">
                      <span className="text-[#e8e4dc] font-semibold">{gmailDeadlines.length}</span> deadline{gmailDeadlines.length !== 1 ? 's' : ''} found
                    </p>
                    <button 
                      onClick={() => setGmailDeadlines(prev => prev.map(d => ({ ...d, selected: !prev.every(x => x.selected) })))}
                      className="text-xs font-medium text-[#c4b998]/70 hover:text-[#c4b998] transition-colors"
                    >
                      {gmailDeadlines.every(d => d.selected) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {gmailDeadlines.map((deadline, idx) => {
                    const deadlineDate = new Date(deadline.deadline);
                    const daysUntil = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isUrgent = daysUntil <= 3;
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleDeadlineSelection(idx)}
                        className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                          deadline.selected
                            ? 'bg-[#c4b998]/[0.06] border-[#c4b998]/20'
                            : 'bg-white/[0.02] border-white/[0.06] opacity-60'
                        } hover:bg-white/[0.06]`}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Checkbox */}
                          <div className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            deadline.selected 
                              ? 'bg-[#c4b998] border-[#c4b998]' 
                              : 'border-white/20 bg-transparent'
                          }`}>
                            {deadline.selected && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="#111113" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#e8e4dc] leading-snug truncate">{deadline.title}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                deadline.priority === 'high' 
                                  ? 'bg-[#c97070]/10 text-[#c97070] border border-[#c97070]/15'
                                  : deadline.priority === 'medium'
                                  ? 'bg-[#c4b998]/10 text-[#c4b998] border border-[#c4b998]/15'
                                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                              }`}>
                                {deadline.priority}
                              </span>
                              <span className="text-[10px] text-white/30">
                                📅 {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              {isUrgent && (
                                <span className="text-[10px] font-semibold text-[#c97070] bg-[#c97070]/10 px-2 py-0.5 rounded-md border border-[#c97070]/15">
                                  {daysUntil <= 0 ? 'TODAY!' : `${daysUntil}d left`}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/20 mt-1.5 truncate">From: {deadline.from}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!gmailLoading && !gmailSuccess && gmailDeadlines.length > 0 && (
              <div className="p-6 pt-4 border-t border-white/[0.06] flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-white/30">
                    {selectedCount} of {gmailDeadlines.length} selected
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowGmailModal(false)}
                      className="px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-medium text-white/50 hover:bg-white/[0.08] hover:text-[#e8e4dc] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddSelectedDeadlines}
                      disabled={selectedCount === 0 || gmailAdding}
                      className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                        selectedCount > 0 && !gmailAdding
                          ? 'bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] hover:shadow-lg hover:shadow-[#c4b998]/10'
                          : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.06]'
                      }`}
                    >
                      {gmailAdding ? (
                        <><Loader2 size={14} className="animate-spin" /> Adding...</>
                      ) : (
                        <><Plus size={14} /> Add {selectedCount} to Schedule</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Settings Panel ───────────────────────────────────────── */}
      {showScheduler && (
        <div className="mb-8 space-y-5 animate-in slide-in-from-top-2 duration-300">
          {/* Time Settings */}
          <div className="figma-glass p-7 md:p-8 space-y-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-[#c4b998]/10 border border-[#c4b998]/15 flex items-center justify-center">
                <Clock size={17} className="text-[#c4b998]" />
              </div>
              <h3 className="text-base font-semibold text-[#e8e4dc]">Study Time</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-white/30 mb-2 block ml-0.5">Start Time</label>
                <div className="flex gap-2">
                  <select value={studyHour} onChange={e => setStudyHour(Number(e.target.value))} className={inputClass}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} className="bg-[#1a1a1e]">{(i % 12 || 12).toString().padStart(2, '0')} {i >= 12 ? 'PM' : 'AM'}</option>
                    ))}
                  </select>
                  <select value={studyMinute} onChange={e => setStudyMinute(Number(e.target.value))} className={`${inputClass} w-24`}>
                    {[0, 15, 30, 45].map(m => (
                      <option key={m} value={m} className="bg-[#1a1a1e]">{m.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/30 mb-2 block ml-0.5">Duration</label>
                <select value={sessionDuration} onChange={e => setSessionDuration(Number(e.target.value))} className={inputClass}>
                  {[30, 45, 60, 90, 120, 150, 180].map(d => (
                    <option key={d} value={d} className="bg-[#1a1a1e]">{d >= 60 ? `${Math.floor(d / 60)}h${d % 60 ? ` ${d % 60}m` : ''}` : `${d}m`}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={applyScheduleChange}
                  className="w-full py-3.5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-[#c4b998]/10 transition-all"
                >
                  Apply to All
                </button>
              </div>
            </div>

            <p className="text-xs text-white/20 mt-1">
              Currently: {formatTime(studyHour, studyMinute)} daily · {sessionDuration >= 60 ? `${Math.floor(sessionDuration / 60)}h${sessionDuration % 60 ? ` ${sessionDuration % 60}m` : ''}` : `${sessionDuration}m`} per session
            </p>
          </div>

          {/* Reminder Settings */}
          <div className="figma-glass p-7 md:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${reminderEnabled ? 'bg-[#8baa6e]/10 border border-[#8baa6e]/15' : 'bg-white/[0.04] border border-white/[0.08]'}`}>
                  {reminderEnabled ? <Bell size={17} className="text-[#8baa6e]" /> : <BellOff size={17} className="text-white/25" />}
                </div>
                <h3 className="text-base font-semibold text-[#e8e4dc]">Email Reminders</h3>
              </div>
              <button
                onClick={() => saveReminderPrefs(!reminderEnabled, reminderMinutes)}
                disabled={reminderSaving}
                className={`relative w-12 h-7 rounded-full transition-all duration-200 ${
                  reminderEnabled ? 'bg-[#8baa6e]' : 'bg-white/10'
                }`}
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-200 ${
                  reminderEnabled ? 'left-[22px]' : 'left-0.5'
                }`} />
              </button>
            </div>

            {reminderEnabled && (
              <div className="flex items-center gap-4 animate-in fade-in duration-200">
                <label className="text-xs font-medium text-white/30 shrink-0">Remind me</label>
                <select
                  value={reminderMinutes}
                  onChange={e => saveReminderPrefs(true, Number(e.target.value))}
                  className={inputClass}
                >
                  {[10, 15, 30, 45, 60, 120].map(m => (
                    <option key={m} value={m} className="bg-[#1a1a1e]">
                      {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`} before
                    </option>
                  ))}
                </select>
              </div>
            )}

            <p className="text-xs text-white/20">
              {reminderEnabled
                ? `Email sent ${reminderMinutes >= 60 ? `${reminderMinutes / 60}h` : `${reminderMinutes}min`} before each session`
                : 'Reminders are off'}
            </p>
          </div>
        </div>
      )}

      {/* ── Date Picker ──────────────────────────────────────────── */}
      <div className="flex gap-2.5 overflow-x-auto pb-5 no-scrollbar scroll-smooth mb-8">
        {dates.map((date, idx) => {
          const isSelected = date.getTime() === selectedDate.getTime();
          const count = dayEventCount(date);
          const isToday = idx === 0;
          const isFriday = date.getDay() === 5;
          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(date)}
              className={`flex flex-col items-center min-w-[76px] py-4 px-3 rounded-2xl transition-all duration-200 border flex-shrink-0 ${
                isSelected
                  ? 'bg-[#c4b998]/15 text-[#c4b998] border-[#c4b998]/25 shadow-lg shadow-[#c4b998]/5'
                  : isFriday
                  ? 'bg-[#c97070]/[0.06] border-[#c97070]/15 text-white/40 hover:bg-[#c97070]/10'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/35 hover:bg-white/[0.05] hover:text-white/60'
              }`}
            >
              <span className={`text-[10px] font-semibold uppercase mb-1 tracking-wide ${isSelected ? 'text-[#c4b998]' : isToday ? 'text-[#8baa6e]' : isFriday ? 'text-[#c97070]/70' : ''}`}>
                {formatDateLabel(date)}
              </span>
              <span className={`text-xl font-bold ${isSelected ? 'text-[#c4b998]' : ''}`}>{date.getDate()}</span>
              {count > 0 && (
                <div className="mt-1.5 flex gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#c4b998]/50' : 'bg-white/20'}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Events Timeline ──────────────────────────────────────── */}
      <div className="flex-1 space-y-4 pb-32">
        {selectedDayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-5">
            <div className="w-20 h-20 bg-white/[0.04] border border-white/[0.06] rounded-2xl flex items-center justify-center">
              <Calendar size={36} className="text-white/15" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#e8e4dc]">No sessions</p>
              <p className="text-base text-white/25 mt-1.5">Nothing scheduled for this day.</p>
            </div>
          </div>
        ) : (
          selectedDayEvents.map((event, idx) => {
            const isStudy = event.type === 'study';
            const isDeadline = event.type === 'deadline';
            const agent = isStudy ? agents.find(a => a.id === event.agent_id) : null;
            const subtopic = agent ? agent.roadmap.flatMap(m => m.subtopics).find(s => s.id === event.subtopic_id) : null;
            const isCompleted = subtopic?.is_completed ?? false;
            const startTime = new Date(event.start_time);
            const endTime = new Date(event.end_time);
            const durationMin = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

            return (
              <div
                key={event.id}
                className={`figma-glass p-6 md:p-7 flex items-start gap-5 transition-all duration-200 ${
                  isCompleted ? 'border-[#8baa6e]/15' : isDeadline ? 'border-[#ea4335]/15 bg-[#ea4335]/[0.02]' : isStudy ? 'hover:bg-white/[0.06]' : 'border-[#c97070]/15'
                }`}
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                {/* Time column */}
                <div className="flex-shrink-0 w-20 pt-0.5">
                  <p className="text-base font-semibold text-[#e8e4dc]">
                    {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-white/20 mt-1">
                    {durationMin >= 60 ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? ` ${durationMin % 60}m` : ''}` : `${durationMin}m`}
                  </p>
                </div>

                {/* Accent bar */}
                <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                  isCompleted ? 'bg-[#8baa6e]' : isDeadline ? 'bg-[#ea4335]' : isStudy ? 'bg-[#c4b998]' : 'bg-[#c97070]'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {agent && (
                    <p className="text-xs font-medium text-white/30 mb-1.5">{agent.subject}</p>
                  )}
                  {isDeadline && (
                    <p className="text-xs font-medium text-[#ea4335]/60 mb-1.5">📧 Email Deadline</p>
                  )}
                  <h4 className="text-base font-semibold text-[#e8e4dc] leading-snug">
                    {event.title.split(': ').length > 1 ? event.title.split(': ')[1] : event.title}
                  </h4>
                  <div className="flex items-center gap-2.5 mt-3">
                    <span className={`text-[10px] font-medium px-2.5 py-1 rounded-lg ${
                      isCompleted ? 'bg-[#8baa6e]/10 text-[#8baa6e] border border-[#8baa6e]/15'
                      : isDeadline ? 'bg-[#ea4335]/10 text-[#ea4335] border border-[#ea4335]/15'
                      : isStudy ? 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                      : 'bg-[#c97070]/10 text-[#c97070] border border-[#c97070]/15'
                    }`}>
                      {isCompleted ? 'Done' : isDeadline ? 'deadline' : event.type}
                    </span>
                    {typeof subtopic?.quiz_score === 'number' && (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                        subtopic.quiz_score >= 70
                          ? 'bg-[#8baa6e]/10 text-[#8baa6e] border border-[#8baa6e]/15'
                          : 'bg-[#c97070]/10 text-[#c97070] border border-[#c97070]/15'
                      }`}>{subtopic.quiz_score}%</span>
                    )}
                  </div>
                </div>

                {/* Action */}
                {isStudy && event.agent_id && event.subtopic_id && (
                  isCompleted ? (
                    <span className="flex-shrink-0 text-sm font-medium text-[#8baa6e] self-center">Completed</span>
                  ) : (
                    <button
                      onClick={() => onStartSession(event.agent_id!, event.subtopic_id!)}
                      className="flex-shrink-0 px-5 py-2.5 bg-gradient-to-r from-[#c4b998] to-[#a89870] text-[#111113] rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-[#c4b998]/10 transition-all self-center flex items-center gap-2"
                    >
                      Start <ChevronRight size={14} />
                    </button>
                  )
                )}
              </div>
            );
          })
        )}

        {/* Deadlines */}
        {tasks.length > 0 && (
          <div className="mt-10 pt-8 border-t border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white/30 mb-5 flex items-center gap-2.5">
              <span className="w-1.5 h-4 bg-[#c97070] rounded-full" />
              Upcoming Deadlines
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tasks.slice(0, 4).map(task => (
                <div key={task.id} className="figma-glass p-5 md:p-6 flex items-center justify-between">
                  <div className="pr-4 min-w-0">
                    <p className="text-base font-semibold text-[#e8e4dc] truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-white/25">{new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                      {task.source === 'Email' && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#ea4335]/10 text-[#ea4335]/70 border border-[#ea4335]/10">📧 Gmail</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium px-3 py-1.5 rounded-lg shrink-0 ${
                    task.priority === 'high' ? 'bg-[#c97070]/10 text-[#c97070] border border-[#c97070]/15' : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                  }`}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Planner;
