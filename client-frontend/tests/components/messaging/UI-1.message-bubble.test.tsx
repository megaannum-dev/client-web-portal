// 021 UI-1 — MessageBubble fidelity: own-vs-other tone inversion, asymmetric
// radii, on-dark attachment variant. Renders against CHAT_DAYS, ported
// verbatim from the design source (fixtures/chat-days.ts) — with the shipped
// app rendering an empty thread (plan §6), this is the only place these
// values are checked at all.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { vi } from "vitest";
import { MessageBubble } from "@/components/messaging/MessageBubble";
import type { ChatMessage } from "@/components/messaging/types";
import { CHAT_DAYS, CHAT_TEAM } from "./fixtures/chat-days";

// Adapts one design-fixture message (design's { who, t, text, doc? } shape)
// into the app's ChatMessage prop shape — the same derivation renderVals()
// does in the design source.
function toChatMessage(raw: (typeof CHAT_DAYS)[number]["msgs"][number], id: string): ChatMessage {
  const own = raw.who === "client";
  return {
    id,
    senderUid: raw.who,
    senderName: CHAT_TEAM[raw.who as keyof typeof CHAT_TEAM],
    role: raw.who as ChatMessage["role"],
    body: raw.text,
    attachments: raw.doc
      ? [{ id: `${id}-doc`, name: raw.doc.name, kind: raw.doc.kind as ChatMessage["attachments"][number]["kind"], size: raw.doc.size }]
      : [],
    createdAt: raw.t,
    own,
    time: raw.t,
  };
}

// 2026-07-18: client message with a doc ("Sending both now.")
const ownWithDoc = toChatMessage(CHAT_DAYS[0].msgs[1], "m-own");
// 2026-07-18: assistant message, no doc
const otherNoDoc = toChatMessage(CHAT_DAYS[0].msgs[0], "m-other");
// 2026-08-28: assistant message with a "sheet" doc
const sheetDoc = toChatMessage(CHAT_DAYS[2].msgs[1], "m-sheet");

describe("UI-1 MessageBubble", () => {
  it("own message: primary fill, no border, 14px 4px 14px 14px radius", () => {
    const { container } = render(<MessageBubble message={ownWithDoc} />);
    const bubble = container.querySelector(".bg-primary.text-primary-foreground");
    expect(bubble).toBeTruthy();
    expect(bubble!.className).toContain("rounded-[14px_4px_14px_14px]");
    expect(bubble!.className).toContain("border-none");
    expect(screen.getByText("messaging.you")).toBeInTheDocument();
  });

  it("other message: outline-variant border, 4px 14px 14px 14px radius, real name shown", () => {
    const { container } = render(<MessageBubble message={otherNoDoc} />);
    const bubble = container.querySelector(".bg-surface-lowest.text-on-surface");
    expect(bubble).toBeTruthy();
    expect(bubble!.className).toContain("rounded-[4px_14px_14px_14px]");
    expect(bubble!.className).toContain("border-outline-variant");
    expect(screen.getByText("Daniel Wu")).toBeInTheDocument();
  });

  it("attachment on an own (primary) bubble gets the white-alpha on-dark variant", () => {
    const { container } = render(<MessageBubble message={ownWithDoc} />);
    const doc = container.querySelector("button.bg-white\\/\\[0\\.16\\]");
    expect(doc).toBeTruthy();
    expect(screen.getByText("HKID_scan.pdf")).toBeInTheDocument();
  });

  it("attachment on an other (surface) bubble gets the surface-low variant, not white-alpha", () => {
    const { container } = render(<MessageBubble message={sheetDoc} />);
    const doc = container.querySelector("button.bg-surface-low");
    expect(doc).toBeTruthy();
  });

  it('a "sheet" kind document renders the FileSpreadsheet icon (via its lucide class), not the default file-text icon', () => {
    const { container } = render(<MessageBubble message={sheetDoc} />);
    expect(container.querySelector(".lucide-file-spreadsheet")).toBeTruthy();
    expect(container.querySelector(".lucide-file-text")).toBeFalsy();
  });

  it("row direction reverses for own messages so the avatar sits on the right", () => {
    const { container: ownC } = render(<MessageBubble message={ownWithDoc} />);
    const { container: otherC } = render(<MessageBubble message={otherNoDoc} />);
    expect(ownC.firstElementChild!.className).toContain("flex-row-reverse");
    expect(otherC.firstElementChild!.className).toContain("flex-row");
    expect(otherC.firstElementChild!.className).not.toContain("flex-row-reverse");
  });
});
