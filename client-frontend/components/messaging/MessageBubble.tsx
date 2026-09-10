// 021 UI-1 — one message row: avatar, meta line, bubble, optional attachment
"use client";

import { useTranslation } from "react-i18next";
import { AttachmentRow } from "./AttachmentRow";
import type { ChatAttachment, ChatMessage } from "./types";

// ponytail: design literals with no token equivalent (plan §2/§123) — the
// client avatar gradient and the assistant-RM fill are hardcoded in the
// source design, not app colours.
const AVATAR_CLASS: Record<ChatMessage["role"], string> = {
  client: "text-[#5a3a17]",
  rm: "bg-primary text-primary-foreground",
  assistant: "bg-[#5c6d63] text-white",
};
const AVATAR_STYLE: Partial<Record<ChatMessage["role"], React.CSSProperties>> = {
  client: { background: "linear-gradient(135deg,#ffd9b0,#f6b878)" },
};

function initials(name: string | null): string {
  return (
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

const ROLE_LABEL_KEY: Partial<Record<ChatMessage["role"], string>> = {
  rm: "messaging.role.rm",
  assistant: "messaging.role.assistant",
};

export function MessageBubble({
  message,
  onDownload,
}: {
  message: ChatMessage;
  /** Download one attachment. A prop, not a hook call: this component stays
   *  presentational so it renders in a test with no AuthProvider. */
  onDownload?: (attachment: ChatAttachment) => void;
}) {
  const { t } = useTranslation();
  const mine = !!message.own;
  const name = mine ? t("messaging.you") : (message.senderName ?? "?");
  const meta = mine ? message.time : `${t(ROLE_LABEL_KEY[message.role] ?? "")} · ${message.time}`;

  return (
    <div className={["flex gap-2.5 items-start", mine ? "flex-row-reverse" : "flex-row"].join(" ")}>
      <span
        className={[
          "size-[30px] rounded-full inline-flex items-center justify-center text-[11px] font-bold flex-none",
          AVATAR_CLASS[message.role],
        ].join(" ")}
        style={AVATAR_STYLE[message.role]}
      >
        {initials(message.senderName)}
      </span>

      <div
        className={[
          "flex flex-col gap-[5px]",
          mine ? "items-end" : "items-start",
          "max-w-[76%]",
        ].join(" ")}
      >
        <div className={["flex gap-2 items-baseline", mine ? "flex-row-reverse" : "flex-row"].join(" ")}>
          <span className="text-[12.5px] font-bold text-on-surface">{name}</span>
          <span className="text-[11px] text-secondary">{meta}</span>
        </div>

        <div
          className={[
            "flex flex-col gap-[9px] items-start py-2.5 px-3.5 text-[13.5px] leading-[1.5]",
            mine
              ? "rounded-[14px_4px_14px_14px] bg-primary text-primary-foreground border-none"
              : "rounded-[4px_14px_14px_14px] bg-surface-lowest text-on-surface border border-outline-variant",
          ].join(" ")}
        >
          {message.body && <span>{message.body}</span>}
          {message.attachments.map((a) => (
            <AttachmentRow key={a.id} attachment={a} meta={`${a.size} · ${message.time}`} onDark={mine} onClick={onDownload ? () => onDownload(a) : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
