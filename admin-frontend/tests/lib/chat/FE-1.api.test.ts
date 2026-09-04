// 021 FE-1 — the chat wire module (admin side: client_id is mandatory).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachmentUrl,
  chatSocketUrl,
  fetchMessages,
  mintWsTicket,
  sendMessage,
} from "@/lib/api/chat";

const fetchMock = vi.fn();

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe("mintWsTicket", () => {
  it("POSTs with a Bearer header", async () => {
    fetchMock.mockResolvedValue(ok({ ticket: "t", expires_in: 30 }));
    await expect(mintWsTicket("tok")).resolves.toEqual({ ticket: "t", expires_in: 30 });
    const [url, init] = lastCall();
    expect(url).toMatch(/\/api\/chat\/ws-ticket$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("omits the header entirely when there is no token", async () => {
    fetchMock.mockResolvedValue(ok({ ticket: "t", expires_in: 30 }));
    await mintWsTicket(null);
    expect(lastCall()[1].headers).toEqual({});
  });

  it("surfaces the server's {detail} rather than a bare status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ detail: "Unknown thread" }),
    } as unknown as Response);
    await expect(mintWsTicket("tok")).rejects.toThrow(/Unknown thread/);
  });
});

describe("fetchMessages", () => {
  it("always names the thread — an ADMIN caller that omits client_id gets a 422", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await fetchMessages("tok", { clientId: "c-1" });
    expect(lastCall()[0]).toContain("client_id=c-1");
  });

  it("passes the since cursor and limit through when given", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await fetchMessages("tok", { clientId: "c-1", since: "2026-09-02T10:00:00Z", limit: 200 });
    const url = lastCall()[0];
    expect(url).toContain("since=2026-09-02T10%3A00%3A00Z");
    expect(url).toContain("limit=200");
  });

  it("omits since when it is null — the first open has no cursor", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await fetchMessages("tok", { clientId: "c-1", since: null });
    expect(lastCall()[0]).not.toContain("since=");
  });
});

describe("sendMessage", () => {
  it("posts multipart and does NOT hand-set Content-Type (fetch must add the boundary)", async () => {
    fetchMock.mockResolvedValue(ok({ id: "m1" }));
    await sendMessage("tok", { clientId: "c-1", body: "hi", files: [] });
    const [, init] = lastCall();
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
    expect(JSON.stringify(init.headers)).not.toMatch(/content-type/i);
  });

  it("carries every staged file in ONE request, under the `files` field", async () => {
    fetchMock.mockResolvedValue(ok({ id: "m1" }));
    const a = new File(["a"], "a.pdf", { type: "application/pdf" });
    const b = new File(["b"], "b.xlsx");
    await sendMessage("tok", { clientId: "c-1", body: "both", files: [a, b] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const form = lastCall()[1].body as FormData;
    expect(form.get("client_id")).toBe("c-1");
    expect(form.get("body")).toBe("both");
    expect(form.getAll("files").map((f) => (f as File).name)).toEqual(["a.pdf", "b.xlsx"]);
  });

  it("a files-only message omits body — the backend accepts body OR attachments", async () => {
    fetchMock.mockResolvedValue(ok({ id: "m1" }));
    await sendMessage("tok", { clientId: "c-1", body: null, files: [new File(["a"], "a.pdf")] });
    expect((lastCall()[1].body as FormData).get("body")).toBeNull();
  });
});

describe("derived URLs", () => {
  it("the attachment URL is built from the id — the DTO ships no download_url", () => {
    expect(attachmentUrl("a-1")).toMatch(/\/api\/chat\/attachments\/a-1$/);
  });

  it("the socket URL reuses the REST base, swapping the scheme", () => {
    const url = chatSocketUrl("tick et");
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain("/api/ws/chat?ticket=tick%20et");
  });
});
