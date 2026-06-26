import "server-only";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";

export type APIResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

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
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.text()).slice(0, 200) || msg; } catch { /* noop */ }
      return { success: false, error: msg, code: `HTTP_${res.status}` };
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
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.text()).slice(0, 200) || msg; } catch { /* noop */ }
      return { result: { success: false, error: msg, code: `HTTP_${res.status}` }, notModified: false };
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
