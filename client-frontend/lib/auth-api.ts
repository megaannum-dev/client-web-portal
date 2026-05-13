import type { PortalUser } from "@/types/portal";

/** Trim trailing slashes so we never request `//api/...` (some stacks return 404). */
export function getApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  return raw.replace(/\/+$/, "");
}

async function parseApiError(res: Response, methodPath: string): Promise<string> {
  let detail = res.statusText;
  try {
    const errJson: unknown = await res.json();
    if (typeof errJson === "object" && errJson !== null && "detail" in errJson) {
      const d = (errJson as { detail?: unknown }).detail;
      if (typeof d === "string") detail = d;
      else if (Array.isArray(d)) detail = d.map((x) => JSON.stringify(x)).join(", ");
    }
  } catch {
    try {
      detail = (await res.text()).slice(0, 200) || detail;
    } catch {
      /* noop */
    }
  }
  const base = getApiBase();
  if (res.status === 404) {
    return `${detail} (${methodPath} → ${base}). If you recently added auth routes, restart the FastAPI server.`;
  }
  return `${detail} (${res.status} ${methodPath})`;
}

/** First-time portal row: returns 201, or 409 if already registered. */
export async function postBackendRegister(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res, "POST /api/auth/register"));
  }
  return (await res.json()) as PortalUser;
}

/** Returning user: upserts email from token and returns portal user. */
export async function postBackendLogin(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res, "POST /api/auth/login"));
  }
  return (await res.json()) as PortalUser;
}

/**
 * After Firebase sign-in or app reload, sync portal profile via login only.
 * The backend login endpoint upserts missing users.
 */
export async function syncPortalUserAfterFirebaseAuth(idToken: string | null): Promise<PortalUser> {
  return postBackendLogin(idToken);
}

export async function postBackendLogout(): Promise<void> {
  await fetch(`${getApiBase()}/api/auth/logout`, { method: "POST" });
}
