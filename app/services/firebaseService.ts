import { User, LearningAgent, Task, ScheduleEvent } from "../types";

const api = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, options);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data as T;
};

const post = <T>(url: string, body: unknown) =>
  api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const firebaseService = {

  async register(data: { name: string; email: string; password: string }): Promise<User> {
    const res = await post<{ ok: boolean; user: User }>("/api/auth/register", data);
    return res.user;
  },

  async login(email: string, pass: string): Promise<User | null> {
    try {
      const res = await post<{ ok: boolean; user: User }>("/api/auth/login", { email, password: pass });
      return res.user;
    } catch (err: any) {
      if (err.message?.includes("Invalid")) return null;
      throw err;
    }
  },

  async loginWithGoogle(email: string, name?: string): Promise<User> {
    // Google auth already upserted the user in /api/auth/google — just fetch them
    const res = await post<{ ok: boolean; user: User }>("/api/auth/login-google", { email, name });
    return res.user;
  },

  async updateUser(uid: string, updates: Partial<User>): Promise<User> {
    const res = await api<{ ok: boolean; user: User }>(`/api/auth/user/${uid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    return res.user;
  },

  async resetPassword(email: string, newPass: string): Promise<boolean> {
    await post("/api/auth/reset-password", { email, newPassword: newPass });
    return true;
  },

  async saveAgent(agent: LearningAgent): Promise<void> {
    await post("/api/data/agent", { agent });
  },

  async getAgents(uid: string): Promise<LearningAgent[]> {
    const res = await api<{ ok: boolean; agents: LearningAgent[] }>(`/api/data/agents?uid=${uid}`);
    return res.agents;
  },

  async saveTasks(uid: string, tasks: Task[]): Promise<void> {
    await post("/api/data/tasks", { uid, tasks });
  },

  async getTasks(uid: string): Promise<Task[]> {
    const res = await api<{ ok: boolean; tasks: Task[] }>(`/api/data/tasks?uid=${uid}`);
    return res.tasks;
  },

  async saveSchedule(uid: string, schedule: ScheduleEvent[]): Promise<void> {
    await post("/api/data/schedule", { uid, schedule });
  },

  async getSchedule(uid: string): Promise<ScheduleEvent[]> {
    const res = await api<{ ok: boolean; schedule: ScheduleEvent[] }>(`/api/data/schedule?uid=${uid}`);
    return res.schedule;
  },

  async saveAnalytics(user_id: string, agent_id: string, event_type: string, data: Record<string, unknown>): Promise<void> {
    await post("/api/data/analytics", { user_id, agent_id, event_type, data });
  }
};
