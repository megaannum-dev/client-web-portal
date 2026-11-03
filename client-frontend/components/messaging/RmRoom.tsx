"use client";

import { useMemo } from "react";
import { AdvisoryRoom } from "./AdvisoryRoom";
import { useChatThread } from "@/lib/chat/useChatThread";
import type { Participant } from "./types";

/** The live RM thread. Mounting it IS the entry point: the socket opens here
 *  and closes when it unmounts. There is only one thread to be in. */
export function RmRoom({
  self,
  rm,
  onClose,
  maximized,
  onToggleMaximize,
}: {
  self: Participant;
  /** The assigned RM, if any — a room with no RM shows only the client. */
  rm: { name: string | null } | null;
  onClose: () => void;
  maximized: boolean;
  onToggleMaximize: () => void;
}) {
  const { days, sending, send } = useChatThread();

  const participants = useMemo<Participant[]>(
    () => (rm ? [self, { uid: "rm", name: rm.name, role: "rm" }] : [self]),
    [self, rm],
  );

  return (
    <AdvisoryRoom
      messages={days}
      participants={participants}
      sending={sending}
      onSend={(body, files) => void send(body, files)}
      onClose={onClose}
      maximized={maximized}
      onToggleMaximize={onToggleMaximize}
    />
  );
}
