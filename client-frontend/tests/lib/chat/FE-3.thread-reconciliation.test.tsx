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
