// The help assistant's script, as pure data + one transition function.
//
// Three rounds before a client reaches their RM:
//   1. "topic"    — pick a topic        (FAQ_SECTIONS)
//   2. "question" — pick a question     (that section's items), or "not listed"
//   3. "resolved" — was it answered?    yes → back to round 1, no → hand off
// "connected" is terminal: the client has been handed to their RM, and
// Messages opens straight into the RM room from then on.
//
// The log stores keys, never text, so a saved transcript re-renders in
// whichever language the client switches to.

import { FAQ_SECTIONS } from "@/components/faq/faqContent";

export type Entry =
  | { from: "bot"; kind: "ask_topic" }
  | { from: "bot"; kind: "ask_question"; topic: string }
  | { from: "bot"; kind: "answer"; item: string }
  | { from: "bot"; kind: "ask_resolved" }
  | { from: "bot"; kind: "glad" }
  | { from: "bot"; kind: "handoff" }
  | { from: "user"; kind: "topic"; topic: string }
  | { from: "user"; kind: "question"; item: string }
  | { from: "user"; kind: "not_listed" }
  | { from: "user"; kind: "solved" }
  | { from: "user"; kind: "contact_rm" };

export type Stage = "topic" | "question" | "resolved" | "connected";

export interface Session {
  log: Entry[];
  stage: Stage;
  /** The topic picked in round 1, while in round 2. */
  topic: string | null;
}

export type Choice =
  | { type: "topic"; topic: string }
  | { type: "question"; item: string }
  | { type: "not_listed" }
  | { type: "solved" }
  | { type: "contact_rm" };

export const START: Session = { log: [{ from: "bot", kind: "ask_topic" }], stage: "topic", topic: null };

/** The session after the client makes `choice`. Pure — persisting is the hook's job. */
export function choose(session: Session, choice: Choice): Session {
  const log = session.log;
  switch (choice.type) {
    case "topic":
      return {
        log: [...log, { from: "user", kind: "topic", topic: choice.topic }, { from: "bot", kind: "ask_question", topic: choice.topic }],
        stage: "question",
        topic: choice.topic,
      };
    case "question":
      return {
        log: [
          ...log,
          { from: "user", kind: "question", item: choice.item },
          { from: "bot", kind: "answer", item: choice.item },
          { from: "bot", kind: "ask_resolved" },
        ],
        stage: "resolved",
        topic: null,
      };
    case "solved":
      return {
        log: [...log, { from: "user", kind: "solved" }, { from: "bot", kind: "glad" }, { from: "bot", kind: "ask_topic" }],
        stage: "topic",
        topic: null,
      };
    case "not_listed":
    case "contact_rm":
      return {
        log: [...log, { from: "user", kind: choice.type }, { from: "bot", kind: "handoff" }],
        stage: "connected",
        topic: null,
      };
  }
}

/** The questions offered in round 2 for `topic`. */
export function questionsFor(topic: string | null): string[] {
  return FAQ_SECTIONS.find((s) => s.key === topic)?.items ?? [];
}
