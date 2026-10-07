import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChatDocumentDTO } from "@/lib/api/chat";

const m = vi.hoisted(() => ({
  docs: vi.fn(), senders: vi.fn(), openRoom: vi.fn(), loadMore: vi.fn(),
}));
vi.mock("@/lib/chat/useChatDocuments", () => ({
  useChatDocuments: (...a: unknown[]) => m.docs(...a),
  useChatDocumentSenders: () => m.senders(),
}));
vi.mock("@/components/rm/chat/ChatRoomProvider", () => ({
  useChatRoom: () => ({ openRoom: m.openRoom }),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ portalUser: { firebase_uid: "u-me" }, getIdToken: async () => "t" }),
}));

function doc(id: string, over: Partial<ChatDocumentDTO> = {}): ChatDocumentDTO {
  return {
    id, filename: `${id}.pdf`, content_type: "application/pdf", size_bytes: 2048,
    created_at: "2026-03-05T10:00:00Z", message_id: "m1", client_id: "c1", client_name: "Acme Ltd",
    sender_uid: "u-x", sender_name: "Sam Client", sender_role: "client", rm_name: "Rita RM", arm_name: null, ...over,
  };
}
const state = (docs: ChatDocumentDTO[], over = {}) => ({
  docs, total: docs.length, loading: false, loadingMore: false, error: null, hasMore: false, loadMore: m.loadMore, ...over,
});

let fire: (isIntersecting: boolean) => void;
beforeEach(() => {
  m.senders.mockReturnValue({ senders: [], loading: false, error: null });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { fire = (v) => cb([{ isIntersecting: v }]); }
    observe() {} disconnect() {} unobserve() {}
  });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

async function renderPage() {
  const { default: Page } = await import("@/app/(roles)/rm/client-correspondents/page");
  return render(<Page />);
}

describe("Client Correspondents page", () => {
  it("empty state", async () => {
    m.docs.mockReturnValue(state([]));
    await renderPage();
    expect(screen.getByText("No documents match these filters.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 0 documents")).toBeInTheDocument();
  });

  it("rows + footer, You label", async () => {
    m.docs.mockReturnValue(state([doc("a"), doc("b", { sender_uid: "u-me", sender_name: "Rita RM", sender_role: "rm" })], { total: 7 }));
    await renderPage();
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Ltd · Client Room")).toHaveLength(2);
    expect(screen.getByText("Showing 2 of 7 documents")).toBeInTheDocument();
  });

  it("sentinel firing calls loadMore when hasMore", async () => {
    m.docs.mockReturnValue(state([doc("a")], { hasMore: true }));
    await renderPage();
    fire(true);
    expect(m.loadMore).toHaveBeenCalledTimes(1);
  });

  it("Show in group chat opens the room focused on the attachment", async () => {
    m.docs.mockReturnValue(state([doc("a")]));
    await renderPage();
    fireEvent.click(screen.getByTitle("Show in group chat"));
    expect(m.openRoom).toHaveBeenCalledWith(
      { id: "c1", name: "Acme Ltd", assignedRm: "Rita RM" },
      { focusAttachmentId: "a" },
    );
  });
});
