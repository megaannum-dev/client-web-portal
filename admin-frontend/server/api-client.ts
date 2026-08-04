import "server-only";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";

export type APIResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/** §7.1(c) envelope: { detail: string, code?: string, errors?: [...] }.
 *  Returns a display-ready message and, when present, the server's machine-readable slug.
 *  Falls back to statusText, then to `HTTP <status>`, when the body is not JSON — the
 *  fallback must survive Starlette's plain-text 500 and an empty body alike. */
export async function parseErrorEnvelope(res: Response): Promise<{ error: string; code: string }> {
  const fallbackCode = `HTTP_${res.status}`;
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null) {
      const b = body as { detail?: unknown; code?: unknown };
      const detail =
        typeof b.detail === "string"
          ? b.detail
          : Array.isArray(b.detail)
            ? b.detail.map((x) => JSON.stringify(x)).join(", ")
            : null;
      if (detail) {
        return { error: detail, code: typeof b.code === "string" ? b.code : fallbackCode };
      }
    }
  } catch {
    /* not JSON — fall through */
  }
  return { error: res.statusText || `HTTP ${res.status}`, code: fallbackCode };
}

async function getToken(): Promise<string> {
  return (await cookies()).get("id_token")?.value ?? "";
}

function buildHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiClient<T>(
  path: string,
  init?: FetchOptions,
): Promise<APIResult<T>> {
  const token = await getToken();
  const url = `${getApiBase()}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: buildHeaders(token, init?.headers),
    });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) {
      const { error, code } = await parseErrorEnvelope(res);
      return { success: false, error, code };
    }
    return { success: true, data: (await res.json()) as T };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

/** POST a multipart FormData body (file uploads — omits Content-Type so fetch sets the boundary). */
export async function apiClientFormData<T>(
  path: string,
  body: FormData,
): Promise<APIResult<T>> {
  const token = await getToken();
  const url = `${getApiBase()}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) {
      const { error, code } = await parseErrorEnvelope(res);
      return { success: false, error, code };
    }
    return { success: true, data: (await res.json()) as T };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

/** Variant that handles ETag / 304 round-trips (allocation endpoint only). */
export type ConditionalResult<T> = {
  result: APIResult<T>;
  etag?: string;
  notModified: boolean;
};

export async function apiClientConditional<T>(
  path: string,
  etag?: string,
  init?: FetchOptions,
): Promise<ConditionalResult<T>> {
  const token = await getToken();
  const url = `${getApiBase()}${path}`;
  try {
    const headers = buildHeaders(token, init?.headers);
    if (etag) headers["If-None-Match"] = etag;
    const res = await fetch(url, { ...init, cache: "no-store", headers });
    if (res.status === 304) {
      return { result: { success: false, error: "Not Modified", code: "NOT_MODIFIED" }, etag, notModified: true };
    }
    if (res.status === 401) {
      return { result: { success: false, error: "Unauthorized", code: "UNAUTHORIZED" }, notModified: false };
    }
    if (!res.ok) {
      const { error, code } = await parseErrorEnvelope(res);
      return { result: { success: false, error, code }, notModified: false };
    }
    const responseEtag = res.headers.get("ETag") ?? undefined;
    return { result: { success: true, data: (await res.json()) as T }, etag: responseEtag, notModified: false };
  } catch (err) {
    return {
      result: { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" },
      notModified: false,
    };
  }
}
