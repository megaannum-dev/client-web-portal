// 021 UI-5 — ChatRoomProvider: openRoom mounts the panel, closeRoom
// unmounts it, and the panel survives being asked to open a different
// client without ever needing to remount the provider itself.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatRoomProvider, useChatRoom } from "@/components/rm/chat/ChatRoomProvider";

const mockUseAuth = vi.fn(() => ({ portalUser: { role: "RM", grants: { "rm.client-info": "EDIT" } } }));
// Counts socket connects/disconnects; the real handshake has its own suite.
const socket = vi.hoisted(() => ({ opens: 0, closes: 0 }));
vi.mock("@/lib/chat/useChatSocket", async () => {
  const { useEffect } = await import("react");
  return {
    useChatSocket: ({ enabled }: { enabled: boolean }) => {
      useEffect(() => {
        if (!enabled) return;
        socket.opens++;
        return () => {
          socket.closes++;
        };
      }, [enabled]);
      return { status: "idle" };
    },
  };
});
vi.mock("@/components/auth/AuthProvider", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
  useAuth: () => mockUseAuth(),
}));

function Consumer() {
  const { openRoom, closeRoom } = useChatRoom();
  return (
    <div>
      <button type="button" onClick={() => openRoom({ id: "c1", name: "Alex Thompson", assignedRm: "Sarah Mitchell" })}>
        Open Alex
      </button>
      <button type="button" onClick={() => openRoom({ id: "c2", name: "Vela Holdings", assignedRm: "Dana Okafor" })}>
        Open Vela
      </button>
      <button type="button" onClick={closeRoom}>Close</button>
    </div>
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="content-overlay-root"></div>';
});

describe("positive", () => {
  it("openRoom mounts the panel titled for that client; closeRoom unmounts it", () => {
    render(
      <ChatRoomProvider>
        <Consumer />
      </ChatRoomProvider>,
    );
    expect(screen.queryByText(/client room/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Open Alex"));
    expect(screen.getByText("Alex Thompson · Client Room")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByText(/client room/i)).not.toBeInTheDocument();
  });

  it("opening a second client while the panel is open swaps its content without remounting the provider", () => {
    render(
      <ChatRoomProvider>
        <Consumer />
      </ChatRoomProvider>,
    );
    fireEvent.click(screen.getByText("Open Alex"));
    expect(screen.getByText("Alex Thompson · Client Room")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Open Vela"));
    expect(screen.getByText("Vela Holdings · Client Room")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson · Client Room")).not.toBeInTheDocument();
  });

  it("the socket opens with a room, is replaced when switching clients, and closes with the panel", () => {
    socket.opens = 0;
    socket.closes = 0;
    render(
      <ChatRoomProvider>
        <Consumer />
      </ChatRoomProvider>,
    );
    expect(socket.opens).toBe(0); // no room, no socket

    fireEvent.click(screen.getByText("Open Alex"));
    expect([socket.opens, socket.closes]).toEqual([1, 0]);

    fireEvent.click(screen.getByText("Open Vela")); // old socket closed, fresh one opened
    expect([socket.opens, socket.closes]).toEqual([2, 1]);

    fireEvent.click(screen.getByText("Close"));
    expect([socket.opens, socket.closes]).toEqual([2, 2]);
  });
});

describe("negative — useChatRoom outside a provider degrades to a no-op, it does not throw", () => {
  it("openRoom/closeRoom are callable without crashing when there is no ChatRoomProvider ancestor", () => {
    expect(() => render(<Consumer />)).not.toThrow();
    expect(() => fireEvent.click(screen.getByText("Open Alex"))).not.toThrow();
  });
});
