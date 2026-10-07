// Client Correspondents — fetchChatDocuments query building + useChatDocuments paging.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ getIdToken: async () => "tok" }),
}));

import { fetchChatDocuments, type ChatDocumentDTO } from "@/lib/api/chat";
import { useChatDocuments, type ChatDocumentFilters } from "@/lib/chat/useChatDocuments";

const fetchMock = vi.fn();
const ok = (body: unknown) =>
  ({ ok: true, status: 200, statusText: "OK", json: async () => body }) as unknown as Response;
const doc = (id: string) => ({ id, filename: `${id}.pdf` }) as ChatDocumentDTO;
const page = (ids: string[], next: string | null, total = 3) =>
  ok({ items: ids.map(doc), next_cursor: next, total });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchChatDocuments", () => {
  it("repeats sender, omits empty params, sends Bearer", async () => {
    fetchMock.mockResolvedValue(page([], null, 0));
    await fetchChatDocuments("tok", {
      view: "in", sender: ["a", "b"], q: "", date_from: undefined, sort: "asc", cursor: null, limit: 50,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/chat\/documents\?view=in&sender=a&sender=b&sort=asc&limit=50$/);
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("has no query string when there are no params", async () => {
    fetchMock.mockResolvedValue(page([], null, 0));
    await fetchChatDocuments("tok", {});
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/\/api\/chat\/documents$/);
  });
});

describe("useChatDocuments", () => {
  it("appends pages, resets on filter change, loadMore is a no-op at the end", async () => {
    fetchMock
      .mockResolvedValueOnce(page(["1", "2"], "c1"))
      .mockResolvedValueOnce(page(["3"], null))
      .mockResolvedValueOnce(page(["9"], null, 1));
    const { result, rerender } = renderHook(({ f }) => useChatDocuments(f), { initialProps: { f: { view: "all" } as ChatDocumentFilters } });
    await waitFor(() => expect(result.current.docs.map((d) => d.id)).toEqual(["1", "2"]));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.docs.map((d) => d.id)).toEqual(["1", "2", "3"]));
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain("cursor=c1");
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.loadMore());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender({ f: { view: "in" } });
    await waitFor(() => expect(result.current.docs.map((d) => d.id)).toEqual(["9"]));
    expect(result.current.total).toBe(1);
  });

  it("drops a stale response from old filters", async () => {
    let resolveOld!: (r: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((r) => { resolveOld = r; }))
      .mockResolvedValueOnce(page(["new"], null, 1));
    const { result, rerender } = renderHook(({ f }) => useChatDocuments(f), { initialProps: { f: { q: "a" } } });
    rerender({ f: { q: "b" } });
    await waitFor(() => expect(result.current.docs.map((d) => d.id)).toEqual(["new"]));
    await act(async () => { resolveOld(page(["old"], null, 1)); });
    expect(result.current.docs.map((d) => d.id)).toEqual(["new"]);
  });
});
