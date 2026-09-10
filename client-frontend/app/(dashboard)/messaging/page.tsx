// 021 UI-2 — the /messaging page: room chrome, thread, docs aside, composer.
// Presentation only — `messages` is unbound (empty) and onSend/onAttach are
// unwired seams the next branch fills in.
"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import { AdvisoryRoom } from "@/components/messaging/AdvisoryRoom";
import type { Participant } from "@/components/messaging/types";

export default function MessagingPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  // `participants` is NOT mock data and is NOT part of the deferred wiring:
  // the signed-in client and their assigned RM already come off `useProfile()`,
  // the same hook the header uses on every page. Deriving the stack here keeps
  // AdvisoryRoom a pure prop-driven component while letting the room header
  // render truthfully instead of blank.
  //
  // This yields the TWO-party room (plan §5) — deliberately, not incidentally:
  // ClientProfileDTO exposes `assigned_rm` only, with no assistant-RM field, so
  // the client portal cannot name an ARM today even when one is assigned. The
  // third avatar arrives when the backend adds it; nothing here fakes one.
  //
  // ponytail: `uid` is a stable synthetic key, not an identity — RmContactDTO
  // carries no uid and the components use it only as a React key. It becomes a
  // real firebase_uid when messages are wired and senders must be matched.
  const participants = useMemo<Participant[]>(() => {
    const self: Participant = {
      uid: "self",
      name: profile?.name ?? user?.displayName ?? null,
      role: "client",
    };
    const rm = profile?.assigned_rm;
    return rm ? [self, { uid: "rm", name: rm.name, role: "rm" }] : [self];
  }, [profile, user]);

  return (
    // The design's messages screen is `position:absolute;inset:0` inside a
    // main that deliberately covers its own padding (plan §3). This app's
    // <main> is `flex-1 p-8`, un-constrained in height and not `relative` —
    // making it either would change scrolling on all six other pages. So
    // the page escapes its own padding instead: `-m-8` cancels main's p-8,
    // and `h-[calc(100vh-4rem)]` (4rem = header-h) fills the region under
    // the header.
    <div className="-m-8 h-[calc(100vh-4rem)]">
      <AdvisoryRoom messages={[]} participants={participants} />
    </div>
  );
}
