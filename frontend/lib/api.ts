const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("devpulse_token");
}

function authHeaders(overrideToken?: string): Record<string, string> {
  const token = overrideToken || getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export const api = {
  post: async (path: string, body?: unknown, token?: string) => {
    const r = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || err.detail || `API error ${r.status}`);
    }
    return r.json();
  },

  get: async (path: string, params?: Record<string, string>, token?: string) => {
    let url = `${API}${path}`;
    if (params && Object.keys(params).length > 0) {
      url += "?" + new URLSearchParams(params).toString();
    }
    const r = await fetch(url, {
      headers: { ...authHeaders(token) },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || err.detail || `API error ${r.status}`);
    }
    return r.json();
  },

  streamUrl: (path: string, params: Record<string, string>) => {
    const token = getToken();
    if (token) {
      params._token = token;
    }
    const qs = new URLSearchParams(params).toString();
    return `${API}${path}?${qs}`;
  },
};
