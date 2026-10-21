"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { AssistantRoom } from "./assistant/AssistantRoom";
import { useAssistantSession } from "./assistant/useAssistantSession";
import type { Choice } from "./assistant/assistantFlow";
import { RmConnecting } from "./RmConnecting";
import { RmRoom } from "./RmRoom";
import type { Participant } from "./types";

// How long the "connecting you with your RM" screen shows before the room.
export const CONNECTING_MS = 1800;

/**
 * Messages, opened from the FAB. A client starts with the help assistant;
 * once they ask for their RM they see a short connecting screen, then the live
 * RM room — which is where Messages opens from then on (until they start over).
 */
export function ChatPopup({
  onClose,
  sidebarWidth = 0,
}: {
  onClose: () => void;
  /** Maximized, the room starts where the sidebar ends rather than covering it. */
  sidebarWidth?: number;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const assistant = useAssistantSession(user?.uid ?? null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!connecting) return;
    const id = window.setTimeout(() => setConnecting(false), CONNECTING_MS);
    return () => window.clearTimeout(id);
  }, [connecting]);

  const self = useMemo<Participant>(
    () => ({
      // The real uid, so the avatar stack and the `own` check agree on who
      // "you" is. users.id is never on the client wire; firebase_uid is.
      uid: user?.uid ?? "self",
      name: profile?.name ?? user?.displayName ?? null,
      role: "client",
    }),
    [profile, user],
  );
  const rm = profile?.assigned_rm ?? null;

  function pick(choice: Choice) {
    if (assistant.pick(choice).stage === "connected") setConnecting(true);
  }

  return (
    <FloatingPanel label={t("messaging.title")} storageKey="chat-popup-size" sidebarWidth={sidebarWidth}>
      {({ maximized, toggleMaximize }) =>
        connecting ? (
          <RmConnecting rmName={rm?.name ?? null} onClose={onClose} />
        ) : assistant.session.stage === "connected" ? (
          <RmRoom self={self} rm={rm} onClose={onClose} maximized={maximized} onToggleMaximize={toggleMaximize} />
        ) : (
          <AssistantRoom
            session={assistant.session}
            onPick={pick}
            onStartOver={assistant.reset}
            onClose={onClose}
            maximized={maximized}
            onToggleMaximize={toggleMaximize}
          />
        )
      }
    </FloatingPanel>
  );
}
