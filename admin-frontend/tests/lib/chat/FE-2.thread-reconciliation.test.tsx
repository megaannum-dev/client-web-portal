// 021 FE-2 — useChatThread: one id-keyed store reconciling three overlapping
// sources (REST catch-up, our own 201, and the WebSocket echo of that same
// message — the backend fans out to the sender on purpose).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ChatMessageDTO, NewMessageFrame } from "@/lib/api/chat";

const fetchMessages = vi.fn();
const sendMessage = vi.fn();

vi.mock("@/lib/api/chat", () => ({
  fetchMessages: (...a: unknown[]) => fetchMessages(...a),
  sendMessage: (...a: unknown[]) => sendMessage(...a),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    getIdToken: async () => "tok",
    portalUser: { firebase_uid: "uid-me", name: "Sarah Mitchell" },
  }),
}));

import { useChatThread } from "@/lib/chat/useChatThread";

function dto(over: Partial<ChatMessageDTO> = {}): ChatMessageDTO {
  return {
    id: "m1",
    client_id: "c-1",
    sender_uid: "uid-me",
    sender_name: "Sarah Mitchell",
    sender_role: "rm",
    body: "Hello room",
    attachments: [],
    created_at: "2026-09-02T10:00:00.000Z",
    ...over,
  };
}

/** Captures the frame handler the hook registers, so a test can push. */
let push: (frame: NewMessageFrame) => void = () => {};
const subscribe = (handler: (frame: NewMessageFrame) => void) => {
  push = handler;
  return () => {};
};

let api: ReturnType<typeof useChatThread>;

function Probe({ socketOpen = false }: { socketOpen?: boolean }) {
  api = useChatThread({ clientId: "c-1", subscribe, socketOpen });
  const all = api.days.flatMap((d) => d.messages);
  return (
    <div>
      <span data-testid="count">{all.length}</span>
      <ul>
        {all.map((m) => (
          <li key={m.id}>{`${m.id}|${m.body}`}</li>
        ))}
      </ul>
    </div>
  );
}

beforeEach(() => {
  fetchMessages.mockReset().mockResolvedValue([]);
  sendMessage.mockReset();
});

describe("opening a thread", () => {
  it("always fetches first, with no cursor", async () => {
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
    expect(fetchMessages.mock.calls[0][1]).toMatchObject({ clientId: "c-1", since: null });
  });
});

describe("live pushes", () => {
  it("renders a frame for THIS thread", async () => {
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
    act(() => push({ type: "new_message", client_id: "c-1", message: dto({ id: "x" }) }));
    expect(await screen.findByText("x|Hello room")).toBeInTheDocument();
  });

  it("ignores a frame for a DIFFERENT thread — one socket serves the whole book", async () => {
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
    act(() => push({ type: "new_message", client_id: "c-OTHER", message: dto({ id: "y" }) }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("the same message twice collapses to one — `since` is inclusive, so this WILL happen", async () => {
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
    act(() => push({ type: "new_message", client_id: "c-1", message: dto({ id: "dup" }) }));
    act(() => push({ type: "new_message", client_id: "c-1", message: dto({ id: "dup" }) }));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });
});

describe("sending — the optimistic bubble, the 201 and the echo", () => {
  it("shows the message immediately, before the server answers", async () => {
    let resolve!: (v: ChatMessageDTO) => void;
    sendMessage.mockReturnValue(new Promise<ChatMessageDTO>((r) => (resolve = r)));
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());

    await act(async () => {
      void api.send("Hello room", []);
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    await act(async () => {
      resolve(dto({ id: "real" }));
    });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByText("real|Hello room")).toBeInTheDocument();
  });

  it("ECHO-FIRST: the push can beat our own 201 back, and still yields ONE bubble", async () => {
    // The fan-out is awaited inside the POST handler right after commit, so
    // this ordering is entirely real, not a contrived one.
    let resolve!: (v: ChatMessageDTO) => void;
    sendMessage.mockReturnValue(new Promise<ChatMessageDTO>((r) => (resolve = r)));
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());

    await act(async () => {
      void api.send("Hello room", []);
    });
    expect(screen.getByTestId("count").textContent).toBe("1"); // optimistic

    // The echo arrives while the POST is still in flight.
    await act(async () => {
      push({ type: "new_message", client_id: "c-1", message: dto({ id: "real" }) });
    });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    // ...and the 201 lands afterwards, changing nothing.
    await act(async () => {
      resolve(dto({ id: "real" }));
    });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByText("real|Hello room")).toBeInTheDocument();
  });

  it("a failed send withdraws the optimistic bubble and reports why", async () => {
    sendMessage.mockRejectedValue(new Error("Message exceeds the attachment budget"));
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());

    await act(async () => {
      await api.send("Hello room", []);
    });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(api.error).toMatch(/attachment budget/);
  });

  it("an empty draft with no files sends nothing", async () => {
    render(<Probe />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
    await act(async () => {
      await api.send("   ", []);
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("catch-up", () => {
  it("a socket that opens after messages exist refetches from the newest timestamp", async () => {
    fetchMessages.mockResolvedValueOnce([dto({ id: "old", created_at: "2026-09-02T09:00:00.000Z" })]);
    const { rerender } = render(<Probe socketOpen={false} />);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    fetchMessages.mockResolvedValueOnce([]);
    rerender(<Probe socketOpen />);
    await waitFor(() => expect(fetchMessages).toHaveBeenCalledTimes(2));
    expect(fetchMessages.mock.calls[1][1]).toMatchObject({ since: "2026-09-02T09:00:00.000Z" });
  });
});
