// 021 FE-3 — useChatThread (client portal): the optimistic bubble must not
// survive alongside the server's copy of the same message.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ChatMessageDTO, NewMessageFrame } from "@/lib/api/chat";

const fetchMessages = vi.fn();
const sendMessage = vi.fn();

vi.mock("@/lib/api/chat", () => ({
  fetchMessages: (...a: unknown[]) => fetchMessages(...a),
  sendMessage: (...a: unknown[]) => sendMessage(...a),
}));

const listFailed = vi.fn();
const putFailed = vi.fn();
const removeFailed = vi.fn();

vi.mock("@/lib/chat/failedStore", () => ({
  listFailed: (...a: unknown[]) => listFailed(...a),
  putFailed: (...a: unknown[]) => putFailed(...a),
  removeFailed: (...a: unknown[]) => removeFailed(...a),
}));

// The socket is exercised by its own suite; here it only needs to hand back a
// frame pusher so the echo path can be driven.
let push: (frame: NewMessageFrame) => void = () => {};
vi.mock("@/lib/chat/useChatSocket", () => ({
  useChatSocket: ({ onFrame }: { onFrame: (f: NewMessageFrame) => void }) => {
    push = onFrame;
    return { status: "open" };
  },
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    getIdToken: async () => "tok",
    user: { uid: "uid-me", displayName: "Wei Lin" },
  }),
}));

import { useChatThread } from "@/lib/chat/useChatThread";

function dto(over: Partial<ChatMessageDTO> = {}): ChatMessageDTO {
  return {
    id: "m1",
    client_id: "c-1",
    sender_uid: "uid-me",
    sender_name: "Wei Lin",
    sender_role: "client",
    body: "Sup",
    attachments: [],
    created_at: "2026-09-04T04:00:00.000Z",
    ...over,
  };
}

let api: ReturnType<typeof useChatThread>;

function Probe() {
  api = useChatThread();
  const all = api.days.flatMap((d) => d.msgs);
  return (
    <div>
      <span data-testid="count">{all.length}</span>
      {all.map((m) => (
        <span key={m.id}>{`${m.id}|${m.body}`}</span>
      ))}
    </div>
  );
}

beforeEach(() => {
  fetchMessages.mockReset().mockResolvedValue([]);
  sendMessage.mockReset();
  listFailed.mockReset().mockResolvedValue([]);
  putFailed.mockReset().mockResolvedValue(undefined);
  removeFailed.mockReset().mockResolvedValue(undefined);
});

describe("earlier messages page in on demand", () => {
  const page = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) =>
      dto({
        id: `m${String(from + i).padStart(4, "0")}`,
        sender_uid: "someone",
        body: `b${from + i}`,
        created_at: new Date(Date.UTC(2026, 8, 4, 0, 0, from + i)).toISOString(),
      }),
    );

  it("a full first page means more exists; a short one means no more", async () => {
    fetchMessages.mockResolvedValueOnce(page(200, 200));
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(api.hasOlder).toBe(true));
    unmount();
    fetchMessages.mockResolvedValueOnce(page(3));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("3"));
    expect(api.hasOlder).toBe(false);
  });

  it("loadOlder asks for the page before the oldest real id, then updates hasOlder", async () => {
    fetchMessages.mockResolvedValueOnce(page(200, 200));
    render(<Probe />);
    await waitFor(() => expect(api.hasOlder).toBe(true));

    let resolve!: (v: ChatMessageDTO[]) => void;
    fetchMessages.mockReturnValueOnce(new Promise<ChatMessageDTO[]>((r) => (resolve = r)));
    await act(async () => {
      void api.loadOlder();
    });
    expect(api.loadingOlder).toBe(true);
    expect(fetchMessages).toHaveBeenLastCalledWith("tok", { before: "m0200", limit: 200 });

    await act(async () => resolve(page(5)));
    expect(api.loadingOlder).toBe(false);
    expect(api.hasOlder).toBe(false);
    expect(screen.getByTestId("count").textContent).toBe("205");
  });
});

describe("failed sends stay until retried or deleted", () => {
  const flagged = () => api.days.flatMap((d) => d.msgs).filter((m) => m.status === "failed");

  async function failOne() {
    sendMessage.mockRejectedValueOnce(new Error("boom"));
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
    await act(async () => {
      await api.send("Sup", []);
    });
  }

  it("keeps the bubble marked failed, saves it, and leaves error null", async () => {
    await failOne();
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(flagged()).toHaveLength(1);
    expect(api.error).toBeNull();
    expect(putFailed).toHaveBeenCalledWith(expect.objectContaining({ owner: "uid-me", body: "Sup" }));
  });

  it("restores saved failed messages on mount", async () => {
    listFailed.mockResolvedValue([
      { tempId: "temp:old", owner: "uid-me", body: "Earlier", files: [], createdAt: "2026-09-03T04:00:00.000Z" },
    ]);
    render(<Probe />);
    await waitFor(() => expect(screen.getByText("temp:old|Earlier")).toBeInTheDocument());
    expect(flagged()[0].id).toBe("temp:old");
  });

  it("retry removes the saved copy and re-sends once; it is delivered once", async () => {
    await failOne();
    const id = flagged()[0].id;
    sendMessage.mockResolvedValueOnce(dto({ id: "real" }));
    await act(async () => api.retry(id));
    await waitFor(() => expect(screen.getByText("real|Sup")).toBeInTheDocument());
    expect(removeFailed).toHaveBeenCalledWith(id);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(flagged()).toHaveLength(0);
  });

  it("discard removes the bubble and the saved copy", async () => {
    await failOne();
    const id = flagged()[0].id;
    await act(async () => api.discard(id));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(removeFailed).toHaveBeenCalledWith(id);
  });

  it("a failed 'Sup' is left alone when a new 'Sup' arrives twice (201 + echo)", async () => {
    await failOne();
    sendMessage.mockResolvedValueOnce(dto({ id: "real" }));
    await act(async () => {
      await api.send("Sup", []);
    });
    await act(async () => push({ type: "new_message", client_id: "c-1", message: dto({ id: "real" }) }));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(flagged()).toHaveLength(1);
    expect(screen.getByText("real|Sup")).toBeInTheDocument();
  });
});

describe("the sender sees ONE bubble, not two", () => {
  it("the 201 replaces the optimistic message", async () => {
    let resolve!: (v: ChatMessageDTO) => void;
    sendMessage.mockReturnValue(new Promise<ChatMessageDTO>((r) => (resolve = r)));
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());

    await act(async () => {
      void api.send("Sup", []);
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    await act(async () => resolve(dto({ id: "real" })));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByText("real|Sup")).toBeInTheDocument();
  });

  it("the server also echoes our own message back to us, and that is still ONE bubble", async () => {
    // The backend fans out to the sender deliberately, so their other devices
    // update. This tab therefore receives its own message twice.
    let resolve!: (v: ChatMessageDTO) => void;
    sendMessage.mockReturnValue(new Promise<ChatMessageDTO>((r) => (resolve = r)));
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());

    await act(async () => {
      void api.send("Sup", []);
    });
    await act(async () => push({ type: "new_message", client_id: "c-1", message: dto({ id: "real" }) }));
    await act(async () => resolve(dto({ id: "real" })));

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("under StrictMode too — the app ships with it on (Next 14 default)", async () => {
    // React double-invokes state updaters here to surface impure ones. An
    // updater that retired the pending entry inside itself would, on its second
    // run, find it already gone and strand the optimistic bubble next to its
    // confirmed twin — a duplicate that only a reload cleared.
    let resolve!: (v: ChatMessageDTO) => void;
    sendMessage.mockReturnValue(new Promise<ChatMessageDTO>((r) => (resolve = r)));
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());

    await act(async () => {
      void api.send("Sup", []);
    });
    await act(async () => resolve(dto({ id: "real" })));

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByText("real|Sup")).toBeInTheDocument();
  });
});
