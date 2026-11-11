"use client";

// 021 UI-5 / U8 — chat room provider. Lives in the RM layout so the panel
// renders once and survives client-book -> client-detail navigation
// (plan §7's whole reason for a provider instead of page-local state).
//
// The WebSocket lives and dies with the open room: OpenRoom (keyed by client)
// owns it, so opening a room connects, closing the panel disconnects, and
// switching to another client closes the old room's socket and opens a fresh
// one. The cost is one ticket + handshake per room opened; the gain is no
// socket held open while no chat is on screen. The server still keys sockets
// by firebase_uid, so the room filters frames on client_id.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChatRoomPanel } from "./ChatRoomPanel";
import type { Participant } from "./types";
import { useChatSocket } from "@/lib/chat/useChatSocket";
import type { NewMessageFrame } from "@/lib/api/chat";
import { useAuth } from "@/components/auth/AuthProvider";
import { useChatThread } from "@/lib/chat/useChatThread";

/** The minimal client shape either entry point (client-book row, client
 *  detail header) can supply today. `assignedRm` is a display name, not a
 *  uid — `ClientRow`/`useClient` carry no RM uid field yet, so it doubles
 *  as the RM participant's `uid`. Cosmetic only: bubbles are seated by the
 *  wire's `sender_role`, and `own` compares the signed-in user's uid. */
export interface RoomClient {
  id: string;
  name: string | null;
  assignedRm?: string | null;
  /** Room-member uids. Only these two may post, and never an ADMIN
   *  (even if seated); anyone else (ADMIN's view-all included) gets a read-only
   *  composer. Matches send's server gate. */
  rmUid?: string | null;
  armUid?: string | null;
}

function participantsFor(client: RoomClient): Participant[] {
  const participants: Participant[] = [{ uid: client.id, name: client.name, role: "client" }];
  if (client.assignedRm) participants.push({ uid: client.assignedRm, name: client.assignedRm, role: "rm" });
  return participants;
}

type FrameHandler = (frame: NewMessageFrame) => void;

interface ChatRoomContextValue {
  /** `focusAttachmentId` scrolls to and flashes that attachment once the thread loads. */
  openRoom: (client: RoomClient, opts?: { focusAttachmentId?: string }) => void;
  closeRoom: () => void;
}

// ponytail: default is a no-op set, not null-plus-throw. Several existing
// page tests (ADM-5, FE-4) render RM pages directly, outside the RM layout
// that mounts the provider — a throwing default would break every one of
// them for a feature they don't test. A no-op openRoom is also the correct
// real-world fallback: it just means "no panel to open here."
const ChatRoomContext = createContext<ChatRoomContextValue>({
  openRoom: () => {},
  closeRoom: () => {},
});

export function ChatRoomProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<RoomClient | null>(null);
  const [focusAttachmentId, setFocusAttachmentId] = useState<string | null>(null);

  const openRoom = useCallback((c: RoomClient, opts?: { focusAttachmentId?: string }) => {
    setClient(c);
    setFocusAttachmentId(opts?.focusAttachmentId ?? null);
  }, []);
  const closeRoom = useCallback(() => setClient(null), []);

  const value = useMemo(() => ({ openRoom, closeRoom }), [openRoom, closeRoom]);

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
      {client && (
        // Keyed so switching clients starts a clean thread, a clean draft and
        // a fresh socket, rather than leaking the previous room's messages --
        // or worse, its half-typed message -- into the new one.
        <OpenRoom
          key={client.id}
          client={client}
          onClose={closeRoom}
          focusAttachmentId={focusAttachmentId}
          onFocusConsumed={() => setFocusAttachmentId(null)}
        />
      )}
    </ChatRoomContext.Provider>
  );
}

/** The open room. Split out so the socket and thread hook are keyed to one
 *  client -- hooks cannot be called conditionally, and the provider itself must
 *  outlive every room it opens. Unmounting this closes the socket. */
function OpenRoom({
  client,
  onClose,
  focusAttachmentId,
  onFocusConsumed,
}: {
  client: RoomClient;
  onClose: () => void;
  focusAttachmentId: string | null;
  onFocusConsumed: () => void;
}) {
  const listeners = useRef(new Set<FrameHandler>());
  const subscribe = useCallback((handler: FrameHandler) => {
    listeners.current.add(handler);
    return () => {
      listeners.current.delete(handler);
    };
  }, []);
  const onFrame = useCallback((frame: NewMessageFrame) => {
    // Copy: a handler may unsubscribe itself while we iterate.
    for (const handler of Array.from(listeners.current)) handler(frame);
  }, []);
  const { status } = useChatSocket({ enabled: true, onFrame });

  const { days, sending, send, error, retry, discard } = useChatThread({
    clientId: client.id,
    subscribe,
    socketOpen: status === "open",
  });
  const { portalUser } = useAuth();
  const meUid = portalUser?.firebase_uid;
  // ADMIN never posts, even when seated as RM/ARM (server refuses it too).
  const canSend =
    meUid != null && portalUser?.role !== "ADMIN" && (meUid === client.rmUid || meUid === client.armUid);
  return (
    <ChatRoomPanel
      canSend={canSend}
      participants={participantsFor(client)}
      messages={days}
      sending={sending}
      onSend={(body, files) => void send(body, files)}
      onClose={onClose}
      error={error}
      onRetry={retry}
      onDiscard={discard}
      focusAttachmentId={focusAttachmentId}
      onFocusConsumed={onFocusConsumed}
    />
  );
}

export function useChatRoom(): ChatRoomContextValue {
  return useContext(ChatRoomContext);
}
