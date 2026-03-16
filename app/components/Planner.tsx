
import React, { useState, useMemo } from 'react';
import { Task, ScheduleEvent, LearningAgent } from '../types';

interface PlannerProps {
  tasks: Task[];
  schedule: ScheduleEvent[];
  agents: LearningAgent[];
  onStartSession: (agentId: string, subtopicId: string) => void;
}

const Planner: React.FC<PlannerProps> = ({ tasks, schedule, agents, onStartSession }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Generate 14 days for the horizontal picker
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

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Horizontal Date Picker */}
      <div className="sticky top-0 z-10 figma-glass mx-6 mt-6 rounded-[2rem] px-6 py-6 mb-4 shadow-sm border-white/20">
        <h2 className="text-3xl font-black tracking-tighter mb-6 text-white px-2">Daily Schedule</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth px-2">
          {dates.map((date, idx) => {
            const isSelected = date.getTime() === selectedDate.getTime();
            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center min-w-[75px] py-4 rounded-3xl transition-all duration-300 border ${
                  isSelected 
                  ? 'bg-white text-[#0d62bb] border-transparent shadow-lg shadow-black/20 -translate-y-1' 
                  : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white/80 hover:-translate-y-1'
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-90">
                  {formatDateLabel(date)}
                </span>
                <span className="text-2xl font-black">{date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline View */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8 pb-32 custom-scrollbar">
        {selectedDayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 max-w-sm mx-auto">
            <div className="w-24 h-24 bg-white/10 backdrop-blur-md shadow-sm rounded-full flex items-center justify-center text-5xl">🏜️</div>
            <div>
              <p className="text-2xl font-black text-white drop-shadow-sm">All Clear!</p>
              <p className="text-sm font-bold text-white/50 mt-2 leading-relaxed">No sessions scheduled for this day. Enjoy your free time or schedule a new module.</p>
            </div>
          </div>
        ) : (
          <div className="mx-4 lg:mx-8 space-y-8 relative before:absolute before:inset-y-0 before:left-4 before:w-1 before:bg-white/10 before:rounded-full">
            {selectedDayEvents.map((event, idx) => {
              const isStudy = event.type === 'study';
              const agent = isStudy ? agents.find(a => a.id === event.agent_id) : null;
              
              return (
                <div key={event.id} className="relative pl-14 group animate-in slide-in-from-left duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                  {/* Timeline Dot */}
                  <div className={`absolute left-0 top-6 w-9 h-9 rounded-full border-4 border-[#0d62bb] shadow-md z-10 transition-transform group-hover:scale-125 ${
                    isStudy ? 'bg-white' : 'bg-rose-400'
                  }`} />
                  
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-black text-white/50 uppercase tracking-widest pl-1">
                      {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    
                    <div className={`p-8 rounded-[2.5rem] border transition-all duration-300 ${
                      isStudy 
                      ? 'figma-glass hover:border-white/50 hover:shadow-xl hover:-translate-y-1' 
                      : 'bg-rose-500/20 backdrop-blur-md border-rose-300/30 shadow-sm hover:shadow-md'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="flex-1">
                          {agent && (
                            <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-[10px] font-black text-white uppercase tracking-widest mb-3 border border-white/20">
                              {agent.subject}
                            </div>
                          )}
                          <h4 className="text-xl font-black text-white leading-tight">
                            {event.title.split(': ').length > 1 ? event.title.split(': ')[1] : event.title}
                          </h4>
                        </div>
                        
                        {isStudy && event.agent_id && event.subtopic_id && (
                          <button 
                            onClick={() => onStartSession(event.agent_id!, event.subtopic_id!)}
                            className="shrink-0 px-6 py-3 bg-white text-[#0d62bb] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-lg hover:shadow-white/20 active:scale-95"
                          >
                            Launch Lesson
                          </button>
                        )}
                      </div>
                      
                      <div className="mt-6 flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          isStudy ? 'bg-white/20 text-white' : 'bg-rose-500/30 text-rose-100 border border-rose-400/20'
                        }`}>
                          {event.type}
                        </span>
                        <span className="text-xs font-bold text-white/50 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/30"></span>
                          Duration: 120m
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Deadlines Section */}
        {tasks.length > 0 && (
          <div className="mt-8 pt-8 mx-4 lg:mx-8 border-t border-white/10">
            <h3 className="text-xs font-black uppercase text-white/50 tracking-widest mb-6 px-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-rose-400 rounded-full"></span>
              Upcoming Deadlines
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tasks.slice(0, 4).map(task => (
                <div key={task.id} className="p-6 figma-glass rounded-3xl group hover:shadow-md transition-all flex items-center justify-between">
                  <div className="pr-4">
                    <p className="text-sm font-black text-white leading-tight mb-1 group-hover:text-white/80 transition-colors">{task.title}</p>
                    <p className="text-[10px] font-bold text-white/50">{new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shrink-0 ${
                    task.priority === 'high' ? 'bg-rose-500/20 text-rose-100 border border-rose-400/30' : 'bg-white/10 text-white/80 border border-white/20'
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
