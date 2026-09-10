// 021 UI-5 — ChatRoomProvider: openRoom mounts the panel, closeRoom
// unmounts it, and the panel survives being asked to open a different
// client without ever needing to remount the provider itself.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatRoomProvider, useChatRoom } from "@/components/rm/chat/ChatRoomProvider";

const mockUseAuth = vi.fn(() => ({ portalUser: { role: "RM", grants: { "rm.client-info": "EDIT" } } }));
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
});

describe("negative — useChatRoom outside a provider degrades to a no-op, it does not throw", () => {
  it("openRoom/closeRoom are callable without crashing when there is no ChatRoomProvider ancestor", () => {
    expect(() => render(<Consumer />)).not.toThrow();
    expect(() => fireEvent.click(screen.getByText("Open Alex"))).not.toThrow();
  });
});
