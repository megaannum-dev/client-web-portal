"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import { AdvisoryRoom } from "@/components/messaging/AdvisoryRoom";
import { useChatThread } from "@/lib/chat/useChatThread";
import type { Participant } from "@/components/messaging/types";

export default function MessagingPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  // Mounting this page IS the entry point: the socket opens here and closes
  // when the client navigates away. There is only one thread to be in.
  const { days, sending, send } = useChatThread();

  const participants = useMemo<Participant[]>(() => {
    const self: Participant = {
      // The real uid, so the avatar stack and the `own` check agree on who
      // "you" is. users.id is never on the client wire; firebase_uid is.
      uid: user?.uid ?? "self",
      name: profile?.name ?? user?.displayName ?? null,
      role: "client",
    };
    const rm = profile?.assigned_rm;
    return rm ? [self, { uid: "rm", name: rm.name, role: "rm" }] : [self];
  }, [profile, user]);

  return (
    <div className="-m-8 h-[calc(100vh-4rem)]">
      <AdvisoryRoom
        messages={days}
        participants={participants}
        sending={sending}
        onSend={(body, files) => void send(body, files)}
      />
    </div>
  );
}
