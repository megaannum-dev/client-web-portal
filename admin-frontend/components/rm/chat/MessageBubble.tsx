"use client";

// 021 UI-3 — chat message row: avatar, meta line, bubble, attachments.
// Also exports RoomAvatar (ChatRoomPanel's header avatar stack reuses it —
// components/ui/Avatar.tsx is a single fixed gradient with no role/tone
// prop, so the room's per-role avatar stays local to this folder).

import clsx from "clsx";
import { fmtTimestampParts } from "@/lib/pc/format";
import { AttachmentRow } from "./AttachmentRow";
import { CR_ROLE, type ChatMessage, type SenderRole } from "./types";

// ponytail: design literals — no --primary-adjacent token exists for the
// client gradient or the assistant-RM olive; kept as-is per plan §2.
const ROLE_AVATAR: Record<SenderRole, { className: string; style?: React.CSSProperties }> = {
  client: { className: "text-white", style: { background: "linear-gradient(135deg,#ffd9b0,#f6b878)" } },
  rm: { className: "bg-primary text-primary-foreground" },
  assistant: { className: "text-white", style: { background: "#5c6d63" } },
};

function initialsOf(name: string | null): string {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function RoomAvatar({
  name, role, size, ring = false, className,
}: {
  name: string | null;
  role: SenderRole;
  size: number;
  ring?: boolean;
  className?: string;
}) {
  const tone = ROLE_AVATAR[role];
  return (
    <span
      className={clsx(
        "inline-flex flex-none items-center justify-center rounded-full font-bold",
        tone.className,
        ring && "ring-2 ring-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38, letterSpacing: "0.01em", ...tone.style }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function MessageBubble({ message, mode }: { message: ChatMessage; mode: "mini" | "full" }) {
  const own = !!message.own;
  const avatarSize = mode === "full" ? 30 : 26;
  const { time } = fmtTimestampParts(message.createdAt);
  const displayName = own ? "You" : (message.senderName ?? "?");

  return (
    <div className={clsx("flex items-start gap-2.5", own ? "flex-row-reverse" : "flex-row")}>
      <RoomAvatar name={message.senderName} role={message.role} size={avatarSize} />
      <div
        className={clsx(
          "flex flex-col gap-[5px]",
          own ? "items-end" : "items-start",
          mode === "full" ? "max-w-[72%]" : "max-w-[90%]",
        )}
      >
        <div className={clsx("flex items-baseline gap-2", own ? "flex-row-reverse" : "flex-row")}>
          <span className="text-[12.5px] font-bold text-on-surface">{displayName}</span>
          <span className="text-[11px] text-secondary">
            {CR_ROLE[message.role]} · {time}
          </span>
        </div>
        <div
          className={clsx(
            "flex flex-col items-start gap-[9px] text-[13.5px] leading-[1.5]",
            mode === "full" ? "px-3.5 py-2.5" : "px-3 py-[9px]",
            own
              ? "rounded-[14px_4px_14px_14px] bg-primary text-primary-foreground"
              : "rounded-[4px_14px_14px_14px] border border-outline-variant bg-surface-lowest text-on-surface",
          )}
        >
          {message.body && <span>{message.body}</span>}
          {message.attachments.map((a) => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              onDark={own}
              meta={`${a.size} · ${time}`}
              className={clsx(mode === "full" ? "max-w-[280px]" : "max-w-[240px]", "min-w-[176px]")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
