import { getApiBase } from "@/lib/auth-api";

export interface SubscriptionDTO { model_id: string; model_name: string; units: number; ib_account: string | null; }
export interface ClientEventDTO  { id: string; category: string; title: string; body: string; created_at: string; }

async function unwrapResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: unknown = await res.json();
      if (typeof body === "object" && body !== null && "detail" in body) {
        const d = (body as { detail?: unknown }).detail;
        if (typeof d === "string") detail = d;
      }
    } catch { /* noop */ }
    throw new Error(`${detail} (${res.status} ${path})`);
  }
  return (await res.json()) as T;
}

export async function authedGet<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return unwrapResponse<T>(res, path);
}

/** PATCH helper shared by lib/api/* modules — same Bearer/detail-unwrap convention as authedGet. */
export async function authedPatch<T>(path: string, token: string | null, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return unwrapResponse<T>(res, path);
}

/** GET /api/client/subscriptions — the caller supplies its own fresh ID token
 *  (via useAuth().getIdToken()), matching lib/auth-api.ts's convention. */
export async function fetchSubscriptions(token: string | null): Promise<SubscriptionDTO[]> {
  return authedGet<SubscriptionDTO[]>("/api/client/subscriptions", token);
}

/** GET /api/client/events */
export async function fetchEvents(token: string | null): Promise<ClientEventDTO[]> {
  return authedGet<ClientEventDTO[]>("/api/client/events", token);
}
