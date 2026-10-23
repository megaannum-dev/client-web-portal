// Help assistant: the three rounds (topic → question → solved?) as a pure
// transition, and the popup flow around it — assistant first, a connecting
// screen naming the RM, then the RM room, remembered per user until start over.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "u1", displayName: "Alex Thompson" }, getIdToken: async () => "t" }),
}));
vi.mock("@/lib/hooks/useProfile", () => ({
  useProfile: () => ({ data: { name: "Alex Thompson", assigned_rm: { name: "Sarah Mitchell", email: null, phone: null } } }),
}));
// The real room opens a socket; the flow only needs to know it was reached.
vi.mock("@/components/messaging/RmRoom", () => ({
  RmRoom: ({ rm }: { rm: { name: string | null } | null }) => <div>rm-room:{rm?.name}</div>,
}));

import { START, choose } from "@/components/messaging/assistant/assistantFlow";
import { FAQ_SECTIONS, FAQ_VERSION, faqText } from "@/components/faq/faqContent";
import { ChatPopup, CONNECTING_MS } from "@/components/messaging/ChatPopup";

// Real content from content/faq/*.md — any topic and one of its questions.
const en = faqText("en");
const TOPIC = FAQ_SECTIONS[0].key;
const ITEM = FAQ_SECTIONS[0].items[1];

// Testing Library collapses whitespace in the page's text but not in the
// string searched for, so multi-paragraph answers are matched collapsed too.
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("assistantFlow.choose", () => {
  it("topic → question → contact RM ends connected, with every step in the log", () => {
    let s = choose(START, { type: "topic", topic: "kyc" });
    expect(s.stage).toBe("question");
    expect(s.topic).toBe("kyc");

    s = choose(s, { type: "question", item: "kyc_time" });
    expect(s.stage).toBe("resolved");

    s = choose(s, { type: "contact_rm" });
    expect(s.stage).toBe("connected");
    expect(s.log.map((e) => `${e.from}:${e.kind}`)).toEqual([
      "bot:ask_topic",
      "user:topic", "bot:ask_question",
      "user:question", "bot:answer", "bot:ask_resolved",
      "user:contact_rm", "bot:handoff",
    ]);
  });

  it("solved loops back to round 1; not listed hands off from round 2", () => {
    const answered = choose(choose(START, { type: "topic", topic: "kyc" }), { type: "question", item: "kyc_time" });
    expect(choose(answered, { type: "solved" }).stage).toBe("topic");
    expect(choose(choose(START, { type: "topic", topic: "kyc" }), { type: "not_listed" }).stage).toBe("connected");
  });
});

describe("ChatPopup help-assistant flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function walkToRm() {
    fireEvent.click(screen.getByRole("button", { name: en.section(TOPIC) }));
    fireEvent.click(screen.getByRole("button", { name: en.question(ITEM) }));
    fireEvent.click(screen.getByRole("button", { name: "messaging.assistant.contact_rm" }));
  }

  it("starts with the assistant, shows the user's picks as bubbles, then connects to the named RM", () => {
    render(<ChatPopup onClose={() => {}} />);
    expect(screen.getByText("messaging.assistant.name")).toBeInTheDocument();
    expect(screen.queryByText(/rm-room/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.section(TOPIC) }));
    // The pick is echoed into the transcript as the client's bubble.
    expect(screen.getByText(en.section(TOPIC), { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.question(ITEM) }));
    expect(screen.getByText(flat(en.answer(ITEM)))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "messaging.assistant.contact_rm" }));
    expect(screen.getByText("Sarah Mitchell")).toBeInTheDocument();
    expect(screen.getByText("SM")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("messaging.assistant.connecting");

    act(() => vi.advanceTimersByTime(CONNECTING_MS));
    expect(screen.getByText("rm-room:Sarah Mitchell")).toBeInTheDocument();
  });

  it("remembers the hand-off: reopening goes straight to the RM room", () => {
    const first = render(<ChatPopup onClose={() => {}} />);
    walkToRm();
    act(() => vi.advanceTimersByTime(CONNECTING_MS));
    first.unmount();

    render(<ChatPopup onClose={() => {}} />);
    expect(screen.getByText("rm-room:Sarah Mitchell")).toBeInTheDocument();
  });

  it("keeps the transcript across reopening, and start over clears it", () => {
    const first = render(<ChatPopup onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: en.section(TOPIC) }));
    first.unmount();

    render(<ChatPopup onClose={() => {}} />);
    expect(screen.getByRole("button", { name: en.question(ITEM) })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "messaging.assistant.start_over" }));
    expect(screen.queryByRole("button", { name: en.question(ITEM) })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.section(TOPIC) })).toBeInTheDocument();
  });
});

describe("bubble send animation", () => {
  beforeEach(() => localStorage.clear());

  it("a restored transcript appears still; new entries pop in, the assistant's replies after the client's", () => {
    localStorage.setItem(
      "help-assistant:u1",
      JSON.stringify({ log: [{ from: "bot", kind: "ask_topic" }], stage: "topic", topic: null, faqVersion: FAQ_VERSION }),
    );
    render(<ChatPopup onClose={() => {}} />);
    const greeting = screen.getByText("messaging.assistant.ask_topic").closest("[class*='flex gap-2.5']")!;
    expect(greeting.className).not.toContain("animate-bubble-in");

    fireEvent.click(screen.getByRole("button", { name: en.section(TOPIC) }));
    const pick = screen.getByText(en.section(TOPIC), { selector: "span" }).closest("[class*='flex gap-2.5']") as HTMLElement;
    const reply = screen.getByText("messaging.assistant.ask_question").closest("[class*='flex gap-2.5']") as HTMLElement;
    expect(pick.className).toContain("animate-bubble-in-own");
    expect(reply.className).toContain("animate-bubble-in-other");
    expect(pick.style.animationDelay).toBe("");
    expect(reply.style.animationDelay).toBe("400ms");
  });
});

describe("isNewMessage", () => {
  const mountedAt = Date.parse("2026-10-21T10:00:00Z");
  const msg = (over: Partial<import("@/components/messaging/types").ChatMessage>) =>
    ({ id: "m1", createdAt: "2026-10-21T10:00:30Z", own: false, ...over }) as import("@/components/messaging/types").ChatMessage;

  it("animates others' messages that arrive after the room opened, not history", async () => {
    const { isNewMessage } = await import("@/components/messaging/bubbleAnimation");
    expect(isNewMessage(msg({}), mountedAt)).toBe(true);
    expect(isNewMessage(msg({ createdAt: "2026-10-20T09:00:00Z" }), mountedAt)).toBe(false);
  });

  it("animates own messages only as the optimistic bubble, so the confirmed twin doesn't pop twice", async () => {
    const { isNewMessage } = await import("@/components/messaging/bubbleAnimation");
    expect(isNewMessage(msg({ own: true, id: "temp:123" }), mountedAt)).toBe(true);
    expect(isNewMessage(msg({ own: true, id: "srv-9" }), mountedAt)).toBe(false);
  });
});

describe("FAQ version change", () => {
  beforeEach(() => localStorage.clear());

  it("drops a transcript saved against older FAQ content, but keeps a client in the RM room", () => {
    const old = { stage: "resolved", topic: null, faqVersion: "older", log: [{ from: "bot", kind: "ask_topic" }, { from: "user", kind: "topic", topic: TOPIC }] };
    localStorage.setItem("help-assistant:u1", JSON.stringify(old));
    const first = render(<ChatPopup onClose={() => {}} />);
    // Back at round 1: the topic choices, not the stale yes/no.
    expect(screen.getByRole("button", { name: en.section(TOPIC) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "messaging.assistant.solved" })).not.toBeInTheDocument();
    first.unmount();

    localStorage.setItem("help-assistant:u1", JSON.stringify({ ...old, stage: "connected" }));
    render(<ChatPopup onClose={() => {}} />);
    expect(screen.getByText("rm-room:Sarah Mitchell")).toBeInTheDocument();
  });
});
