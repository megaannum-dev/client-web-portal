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
    if (methodPath.includes("/api/dev/register")) {
      return "Self-registration is not available in this environment.";
    }
    return `${detail} (${methodPath} → ${base}). If you recently added auth routes, restart the FastAPI server.`;
  }
  return `${detail} (${res.status} ${methodPath})`;
}

export class BackendAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BackendAuthError";
  }
}

// Dev-only provisioning surface. 404 in a non-dev backend means "not mounted",
// not "restart the server" — parseApiError's 404 branch is split above to
// handle this permanently-absent-in-prod case correctly.
export async function postBackendRegister(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/dev/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken, portal: "client" }),
  });
  if (!res.ok) {
    throw new BackendAuthError(await parseApiError(res, "POST /api/dev/register"), res.status);
  }
  return (await res.json()) as PortalUser;
}

// Bind-only — 403 means "no account staged for this uid, or account disabled".
// Body drops the old `portal` field: the route itself is portal-scoped now.
export async function postBackendLogin(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/client/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    throw new BackendAuthError(await parseApiError(res, "POST /api/auth/client/login"), res.status);
  }
  return (await res.json()) as PortalUser;
}

/**
 * After Firebase sign-in or app reload, sync portal profile via login only.
 * Login binds an existing account only — it never creates one; `postBackendRegister`
 * (dev-only) is the sole provisioning path from this frontend.
 */
export async function syncPortalUserAfterFirebaseAuth(idToken: string | null): Promise<PortalUser> {
  return postBackendLogin(idToken);
}

export async function postBackendLogout(): Promise<void> {
  await fetch(`${getApiBase()}/api/auth/logout`, { method: "POST" });
}
