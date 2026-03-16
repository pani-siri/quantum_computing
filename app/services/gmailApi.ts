export type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  subject?: string;
  from?: string;
  date?: string;
  body?: string;
};

type ApiResponse<T> = T & { error?: string };

const parseJson = async <T>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { error: text } as ApiResponse<T>;
  }
};

export const gmailApi = {
  async status(uid: string): Promise<{ connected: boolean; lastSyncAt?: string | null }> {
    const res = await fetch(`/api/gmail/status?uid=${encodeURIComponent(uid)}`);
    const data = await parseJson<{ ok: boolean; connected: boolean; lastSyncAt?: string | null }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load Gmail status");
    return { connected: Boolean(data.connected), lastSyncAt: data.lastSyncAt };
  },

  async getOAuthUrl(uid: string): Promise<string> {
    const res = await fetch(`/api/gmail/oauth/url?uid=${encodeURIComponent(uid)}`);
    const data = await parseJson<{ ok: boolean; url: string }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to get Gmail OAuth URL");
    return data.url;
  },

  async disconnect(uid: string): Promise<void> {
    const res = await fetch(`/api/gmail/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid })
    });
    const data = await parseJson<{ ok: boolean }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to disconnect Gmail");
  },

  async fetchMessages(
    uid: string,
    opts?: { q?: string; max?: number; force?: boolean; pageToken?: string }
  ): Promise<{ q: string; messages: GmailMessage[]; nextPageToken: string | null; meta?: any }> {
    const params = new URLSearchParams();
    params.set("uid", uid);
    if (opts?.q) params.set("q", opts.q);
    if (typeof opts?.max === "number") params.set("max", String(opts.max));
    if (opts?.force) params.set("force", "1");
    if (opts?.pageToken) params.set("pageToken", opts.pageToken);

    const res = await fetch(`/api/gmail/messages?${params.toString()}`);
    const data = await parseJson<{ ok: boolean; q: string; messages: GmailMessage[]; nextPageToken?: string | null; meta?: any }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to fetch Gmail messages");
    return {
      q: data.q,
      messages: Array.isArray(data.messages) ? data.messages : [],
      nextPageToken: data.nextPageToken ?? null,
      meta: data.meta
    };
  }
};
