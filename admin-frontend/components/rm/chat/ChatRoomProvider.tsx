"use client";

// 021 UI-5 — chat room provider. Lives in the RM layout so the panel
// renders once and survives client-book -> client-detail navigation
// (plan §7's whole reason for a provider instead of page-local state).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ChatRoomPanel } from "./ChatRoomPanel";
import type { Participant } from "./types";

/** The minimal client shape either entry point (client-book row, client
 *  detail header) can supply today. `assignedRm` is a display name, not a
 *  uid — `ClientRow`/`useClient` carry no RM uid field yet, so it doubles
 *  as the RM participant's `uid` until the wiring branch has a real one. */
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

interface ChatRoomContextValue {
  openRoom: (client: RoomClient) => void;
  closeRoom: () => void;
}

// ponytail: default is a no-op pair, not null-plus-throw. Several existing
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

  const openRoom = useCallback((c: RoomClient) => setClient(c), []);
  const closeRoom = useCallback(() => setClient(null), []);
  const value = useMemo(() => ({ openRoom, closeRoom }), [openRoom, closeRoom]);

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
      {client && <ChatRoomPanel participants={participantsFor(client)} onClose={closeRoom} />}
    </ChatRoomContext.Provider>
  );
}

export function useChatRoom(): ChatRoomContextValue {
  return useContext(ChatRoomContext);
}
