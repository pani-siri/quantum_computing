export type OtpPurpose = "register" | "reset";

type ApiResponse<T> = T & { error?: string };

const parseJson = async <T>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { error: text } as ApiResponse<T>;
  }
};

export const authApi = {
  async sendOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const res = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose })
    });

    const data = await parseJson<{ ok: boolean }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to send OTP");
  },

  async verifyOtp(email: string, purpose: OtpPurpose, otp: string): Promise<void> {
    const res = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose, otp })
    });

    const data = await parseJson<{ ok: boolean }>(res);
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to verify OTP");
  },

  async verifyGoogleCredential(credential: string): Promise<{ email: string; name?: string }>
  {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential })
    });

    const data = await parseJson<{ ok: boolean; profile?: { email: string; name?: string } }>(res);
    if (!res.ok || !data.ok || !data.profile) throw new Error(data.error || "Google sign-in failed");
    return data.profile;
  }
};
