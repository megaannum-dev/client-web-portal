"use client";

// 021 UI-5 / U8 — chat room provider. Lives in the RM layout so the panel
// renders once and survives client-book -> client-detail navigation
// (plan §7's whole reason for a provider instead of page-local state).
//
// U8 also makes this the home of the session WebSocket. The socket is keyed
// server-side by firebase_uid, not by thread, so one connection serves every
// client in this RM's book: the first openRoom connects it, and closeRoom
// deliberately does NOT close it -- closing a panel and opening another must
// not re-handshake. It is torn down only when the RM section unmounts.

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
import { useChatSocket, type ChatSocketStatus } from "@/lib/chat/useChatSocket";
import type { NewMessageFrame } from "@/lib/api/chat";
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
}

function participantsFor(client: RoomClient): Participant[] {
  const participants: Participant[] = [{ uid: client.id, name: client.name, role: "client" }];
  if (client.assignedRm) participants.push({ uid: client.assignedRm, name: client.assignedRm, role: "rm" });
  return participants;
}

type FrameHandler = (frame: NewMessageFrame) => void;

interface ChatRoomContextValue {
  openRoom: (client: RoomClient) => void;
  closeRoom: () => void;
  /** Register a listener for pushes. Returns its unsubscribe. Frames arrive for
   *  every thread this RM is in, so listeners must filter on client_id. */
  subscribe: (handler: FrameHandler) => () => void;
  socketStatus: ChatSocketStatus;
}

// ponytail: default is a no-op set, not null-plus-throw. Several existing
// page tests (ADM-5, FE-4) render RM pages directly, outside the RM layout
// that mounts the provider — a throwing default would break every one of
// them for a feature they don't test. A no-op openRoom is also the correct
// real-world fallback: it just means "no panel to open here."
const ChatRoomContext = createContext<ChatRoomContextValue>({
  openRoom: () => {},
  closeRoom: () => {},
  subscribe: () => () => {},
  socketStatus: "idle",
});

export function ChatRoomProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<RoomClient | null>(null);
  // Latched, never cleared: the socket outlives any single room (see header).
  const [everOpened, setEverOpened] = useState(false);

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

  const { status: socketStatus } = useChatSocket({ enabled: everOpened, onFrame });

  const openRoom = useCallback((c: RoomClient) => {
    setEverOpened(true);
    setClient(c);
  }, []);
  const closeRoom = useCallback(() => setClient(null), []);

  const value = useMemo(
    () => ({ openRoom, closeRoom, subscribe, socketStatus }),
    [openRoom, closeRoom, subscribe, socketStatus],
  );

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
      {client && (
        // Keyed so switching clients starts a clean thread and a clean draft,
        // rather than leaking the previous room's messages — or worse, its
        // half-typed message — into the new one. The SOCKET is unaffected:
        // it lives here, above the key.
        <OpenRoom
          key={client.id}
          client={client}
          subscribe={subscribe}
          socketOpen={socketStatus === "open"}
          onClose={closeRoom}
        />
      )}
    </ChatRoomContext.Provider>
  );
}

/** The open room. Split out purely so the thread hook can be keyed to one
 *  client — hooks cannot be called conditionally, and the provider itself must
 *  outlive every room it opens. */
function OpenRoom({
  client,
  subscribe,
  socketOpen,
  onClose,
}: {
  client: RoomClient;
  subscribe: (handler: FrameHandler) => () => void;
  socketOpen: boolean;
  onClose: () => void;
}) {
  const { days, sending, send } = useChatThread({
    clientId: client.id,
    subscribe,
    socketOpen,
  });
  return (
    <ChatRoomPanel
      participants={participantsFor(client)}
      messages={days}
      sending={sending}
      onSend={(body, files) => void send(body, files)}
      onClose={onClose}
    />
  );
}

export function useChatRoom(): ChatRoomContextValue {
  return useContext(ChatRoomContext);
}
