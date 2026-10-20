"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import { useResizableBox, type ResizeEdge } from "@/lib/hooks/useResizableBox";
import { AdvisoryRoom } from "@/components/messaging/AdvisoryRoom";
import { useChatThread } from "@/lib/chat/useChatThread";
import type { Participant } from "@/components/messaging/types";

const DEFAULT_SIZE = { width: 420, height: 600 };
const MIN_SIZE     = { width: 360, height: 420 };
// Gap kept from the sidebar and the top of the viewport at max size.
const MAXIMIZED_MARGIN = 24;
// The popup is pinned right-8 (32px). The FAB stays in the bottom-right corner
// while the chat is open (its quick actions must stay reachable), so the
// popup's bottom edge clears it:
// bottom-8 (32) + FAB pill (10 + 56 + 10) + a 16px gap = 124 = bottom-[124px].
const RIGHT_OFFSET  = 32;
const BOTTOM_OFFSET = 124;

// Invisible grab zones along the edges that face the page. The box is pinned
// bottom-right, so only the top and left edges (and their corner) move.
const HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: "top",      className: "top-0 left-3 right-0 h-1.5 cursor-ns-resize" },
  { edge: "left",     className: "left-0 top-3 bottom-0 w-1.5 cursor-ew-resize" },
  { edge: "top-left", className: "top-0 left-0 size-3 cursor-nwse-resize" },
];

/** The Advisory Room as a floating, resizable panel — opened from the FAB. */
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
  // Mounting the popup IS the entry point: the socket opens here and closes
  // when the popup closes. There is only one thread to be in.
  const { days, sending, send } = useChatThread();
  // The maximized area is the resize boundary: the box can only ever be
  // dragged smaller than it, never past the sidebar gap or the top margin.
  const reserved = useMemo(
    () => ({
      width: sidebarWidth + MAXIMIZED_MARGIN + RIGHT_OFFSET,
      height: MAXIMIZED_MARGIN + BOTTOM_OFFSET,
    }),
    [sidebarWidth],
  );
  const { size, handleResizeStart } = useResizableBox("chat-popup-size", DEFAULT_SIZE, MIN_SIZE, reserved);
  // Maximized fills that boundary; restoring returns to the last dragged size,
  // which useResizableBox keeps untouched meanwhile. Dragging an edge while
  // maximized drops back to a window, starting from the maximized size.
  const [maximized, setMaximized] = useState(false);

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
    <div
      role="dialog"
      aria-label={t("messaging.title")}
      className={[
        // z-40: under the FAB and its click-away backdrop (both z-40/50, later in the DOM).
        "fixed z-40 right-8 bottom-[124px] overflow-hidden rounded-xl shadow-overlay border border-outline-variant",
        // Plays once on mount (opening only); toggling maximize keeps the
        // same animation name, so it does not replay.
        "animate-genie-in",
      ].join(" ")}
      style={
        // Maximized still floats with a margin all round, so the page behind
        // stays visible and sidebar navigation doesn't look like a frozen app.
        maximized
          ? { left: sidebarWidth + MAXIMIZED_MARGIN, top: MAXIMIZED_MARGIN }
          : { width: size.width, height: size.height }
      }
    >
      <AdvisoryRoom
        messages={days}
        participants={participants}
        sending={sending}
        onSend={(body, files) => void send(body, files)}
        onClose={onClose}
        maximized={maximized}
        onToggleMaximize={() => setMaximized((v) => !v)}
      />
      {HANDLES.map(({ edge, className }) => (
        <div
          key={edge}
          aria-hidden
          onPointerDown={(e) => {
            setMaximized(false);
            handleResizeStart(edge)(e);
          }}
          className={`absolute z-10 touch-none ${className}`}
        />
      ))}
    </div>
  );
}
