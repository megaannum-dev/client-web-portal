// 021 UI-3 — MessageBubble fidelity assertions against the CR_DAYS fixture.
// With the running app shipping an empty thread (plan §6), these are the
// only check that the bubble's asymmetric radii/tones/attachment variant
// are actually correct.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/rm/chat/MessageBubble";
import { CR_DAYS } from "./fixtures/chat-days";

const day1 = CR_DAYS[0];
const ownMsg = day1.messages.find((m) => m.own)!; // m5 — Sarah Mitchell (rm), own
const otherMsg = day1.messages.find((m) => !m.own && m.role === "client")!; // m2 — has an attachment
const docMsg = day1.messages.find((m) => m.attachments.length > 0)!;

describe("positive", () => {
  it("an own message renders on bg-primary with the mine radius and no border", () => {
    const { container } = render(<MessageBubble message={ownMsg} mode="full" />);
    // scope past RoomAvatar, which also carries bg-primary for the "rm" role
    const bubble = container.querySelector("div.bg-primary")!;
    expect(bubble).toBeInTheDocument();
    expect(bubble.className).toContain("rounded-[14px_4px_14px_14px]");
    expect(bubble.className).not.toContain("border-outline-variant");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/Relationship Manager/)).toBeInTheDocument();
  });

  it("an other message renders bordered with the mirrored radius, and shows the real sender name", () => {
    const { container } = render(<MessageBubble message={otherMsg} mode="full" />);
    const bubble = container.querySelector(".border-outline-variant")!;
    expect(bubble).toBeInTheDocument();
    expect(bubble.className).toContain("rounded-[4px_14px_14px_14px]");
    expect(bubble.className).toContain("bg-surface-lowest");
    expect(screen.getByText("Alex Thompson")).toBeInTheDocument();
    expect(screen.getByText(/Client/)).toBeInTheDocument();
  });

  it("a message with an attachment renders the AttachmentRow with the doc name", () => {
    render(<MessageBubble message={docMsg} mode="full" />);
    expect(screen.getByText(docMsg.attachments[0].name)).toBeInTheDocument();
  });
});

describe("invariants", () => {
  it("full mode caps the column at 72%, mini mode at 90%", () => {
    const { container: full } = render(<MessageBubble message={otherMsg} mode="full" />);
    expect(full.querySelector(".max-w-\\[72\\%\\]")).toBeInTheDocument();
    const { container: mini } = render(<MessageBubble message={otherMsg} mode="mini" />);
    expect(mini.querySelector(".max-w-\\[90\\%\\]")).toBeInTheDocument();
  });

  it("avatar size steps from 26 (mini) to 30 (full)", () => {
    const { container: mini } = render(<MessageBubble message={otherMsg} mode="mini" />);
    const miniAvatar = mini.querySelector("span.rounded-full") as HTMLElement;
    expect(miniAvatar.style.width).toBe("26px");

    const { container: full } = render(<MessageBubble message={otherMsg} mode="full" />);
    const fullAvatar = full.querySelector("span.rounded-full") as HTMLElement;
    expect(fullAvatar.style.width).toBe("30px");
  });
});
