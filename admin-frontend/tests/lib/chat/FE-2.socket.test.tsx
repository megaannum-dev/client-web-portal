// 021 FE-2 — useChatSocket: ticket handshake, one socket per session, and a
// reconnect that never replays a spent ticket.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const mintWsTicket = vi.fn();

vi.mock("@/lib/api/chat", () => ({
  mintWsTicket: (...a: unknown[]) => mintWsTicket(...a),
  chatSocketUrl: (t: string) => `ws://api.test/api/ws/chat?ticket=${t}`,
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ getIdToken: async () => "tok" }),
}));

import { useChatSocket } from "@/lib/chat/useChatSocket";
import type { NewMessageFrame } from "@/lib/api/chat";

/** jsdom ships no WebSocket, so the hook gets a fake it can drive. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function Probe({
  enabled = true,
  onFrame = () => {},
  onOpen,
}: {
  enabled?: boolean;
  onFrame?: (f: NewMessageFrame) => void;
  onOpen?: () => void;
}) {
  const { status } = useChatSocket({ enabled, onFrame, onOpen });
  return <span data-testid="status">{status}</span>;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  FakeSocket.instances = [];
  mintWsTicket.mockReset();
  let n = 0;
  mintWsTicket.mockImplementation(async () => ({ ticket: `t${++n}`, expires_in: 30 }));
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("opening", () => {
  it("mints a ticket and connects with it in the query string", async () => {
    render(<Probe />);
    await flush();
    expect(mintWsTicket).toHaveBeenCalledTimes(1);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].url).toContain("ticket=t1");
  });

  it("does nothing at all while disabled — the entry point gates the connection", async () => {
    render(<Probe enabled={false} />);
    await flush();
    expect(mintWsTicket).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("reports open and fires onOpen so the consumer can catch up", async () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(<Probe onOpen={onOpen} />);
    await flush();
    await act(async () => FakeSocket.instances[0].onopen?.());
    expect(getByTestId("status").textContent).toBe("open");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a re-render does not open a second socket — one per session, not per render", async () => {
    const { rerender } = render(<Probe onFrame={() => {}} />);
    await flush();
    // A fresh onFrame identity each render is the realistic case.
    rerender(<Probe onFrame={() => {}} />);
    rerender(<Probe onFrame={() => {}} />);
    await flush();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(mintWsTicket).toHaveBeenCalledTimes(1);
  });
});

describe("frames", () => {
  it("delivers new_message frames and ignores anything else", async () => {
    const onFrame = vi.fn();
    render(<Probe onFrame={onFrame} />);
    await flush();
    const ws = FakeSocket.instances[0];
    await act(async () => ws.onopen?.());

    await act(async () => ws.onmessage?.({ data: JSON.stringify({ type: "new_message", client_id: "c1", message: { id: "m1" } }) }));
    expect(onFrame).toHaveBeenCalledTimes(1);

    await act(async () => ws.onmessage?.({ data: JSON.stringify({ type: "something_else" }) }));
    await act(async () => ws.onmessage?.({ data: "not json at all" }));
    expect(onFrame).toHaveBeenCalledTimes(1); // and neither killed the socket
  });
});

describe("reconnecting", () => {
  it("a server close mints a NEW ticket — they are single-use and 30s-lived", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Probe />);
    await flush();
    await act(async () => FakeSocket.instances[0].onopen?.());

    // The 3600s lifetime cap closes the socket; this is the routine case.
    await act(async () => FakeSocket.instances[0].onclose?.());
    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mintWsTicket).toHaveBeenCalledTimes(2);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url).toContain("ticket=t2");
  });

  it("stops calling it transient after repeated failure instead of retrying invisibly", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mintWsTicket.mockRejectedValue(new Error("down"));
    const { getByTestId } = render(<Probe />);
    await flush();
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(40_000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }
    expect(getByTestId("status").textContent).toBe("lost");
  });
});

describe("teardown", () => {
  it("closes the socket and never reconnects after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = render(<Probe />);
    await flush();
    await act(async () => FakeSocket.instances[0].onopen?.());

    unmount();
    expect(FakeSocket.instances[0].closed).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    // Still just the one: the close our own teardown caused must not schedule
    // a reconnect for a hook that is going away.
    expect(FakeSocket.instances).toHaveLength(1);
    expect(mintWsTicket).toHaveBeenCalledTimes(1);
  });
});
