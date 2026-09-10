// 021 UI-3 — CR_DAYS fixture, ported verbatim (text/dates/docs) from the
// design source's CHAT_DAYS mock (client-messaging.txt lines 187-213 — the
// RM project's own ChatRoom.jsx is the same room, so this is the reference
// per rm-chatroom-deltas.md's header note). Reshaped into this app's
// ChatDay/ChatMessage/ChatAttachment types; `own` marks the signed-in RM's
// own messages, matching the RM design's `mine = who === "rm" && rm === rmName`
// (rm-chatroom-deltas.md "Bubbles").
//
// Test-only: no mock conversation data ships in app code (plan §6).
import type { ChatDay } from "@/components/rm/chat/types";

export const CR_DAYS: ChatDay[] = [
  {
    iso: "2026-07-18",
    label: "Fri, 18 Jul 2026",
    messages: [
      {
        id: "m1", senderUid: "u-assistant", senderName: "Daniel Wu", role: "assistant",
        body: "Starting the annual KYC refresh today. I'll need a current ID scan and a proof of address dated within three months.",
        attachments: [], createdAt: "2026-07-18T09:05:00Z",
      },
      {
        id: "m2", senderUid: "u-client", senderName: "Alex Thompson", role: "client",
        body: "Sending both now.",
        attachments: [{ id: "a1", name: "HKID_scan.pdf", kind: "file-check", size: "1.4 MB" }],
        createdAt: "2026-07-18T11:40:00Z",
      },
      {
        id: "m3", senderUid: "u-client", senderName: "Alex Thompson", role: "client",
        body: "And the utility bill for the registered address.",
        attachments: [{ id: "a2", name: "Address_Proof_Jul26.pdf", kind: "file-text", size: "760 KB" }],
        createdAt: "2026-07-18T11:41:00Z",
      },
      {
        id: "m4", senderUid: "u-assistant", senderName: "Daniel Wu", role: "assistant",
        body: "Both received and logged against the checklist — nothing outstanding on your side.",
        attachments: [{ id: "a3", name: "KYC_Checklist.pdf", kind: "file-text", size: "64 KB" }],
        createdAt: "2026-07-18T14:22:00Z",
      },
      {
        id: "m5", senderUid: "u-rm", senderName: "Sarah Mitchell", role: "rm", own: true,
        body: "Thanks for turning that around so quickly. Compliance should clear it within the week.",
        attachments: [], createdAt: "2026-07-18T16:08:00Z",
      },
    ],
  },
  {
    iso: "2026-08-11",
    label: "Mon, 11 Aug 2026",
    messages: [
      {
        id: "m6", senderUid: "u-rm", senderName: "Sarah Mitchell", role: "rm", own: true,
        body: "The mandate amendment we discussed is ready for signature — it widens the FX hedging band to ±5%.",
        attachments: [], createdAt: "2026-08-11T10:12:00Z",
      },
      {
        id: "m7", senderUid: "u-client", senderName: "Alex Thompson", role: "client",
        body: "Signed and returned.",
        attachments: [{ id: "a4", name: "Mandate_Amendment_signed.pdf", kind: "file-check", size: "96 KB" }],
        createdAt: "2026-08-11T15:30:00Z",
      },
      {
        id: "m8", senderUid: "u-rm", senderName: "Sarah Mitchell", role: "rm", own: true,
        body: "Received. It takes effect from the next rebalance.",
        attachments: [], createdAt: "2026-08-11T15:52:00Z",
      },
    ],
  },
  {
    iso: "2026-08-28",
    label: "Thu, 28 Aug 2026",
    messages: [
      {
        id: "m9", senderUid: "u-rm", senderName: "Sarah Mitchell", role: "rm", own: true,
        body: "Quarterly review pack is out — headline is +3.2% against a +2.4% benchmark.",
        attachments: [{ id: "a5", name: "Q2_Review_Pack.pdf", kind: "file-text", size: "2.1 MB" }],
        createdAt: "2026-08-28T08:30:00Z",
      },
      {
        id: "m10", senderUid: "u-assistant", senderName: "Daniel Wu", role: "assistant",
        body: "Attribution detail is in the workbook if you want the line-by-line.",
        attachments: [{ id: "a6", name: "Performance_Attribution.xlsx", kind: "sheet", size: "188 KB" }],
        createdAt: "2026-08-28T08:34:00Z",
      },
      {
        id: "m11", senderUid: "u-client", senderName: "Alex Thompson", role: "client",
        body: "Read it over the weekend. Happy with the equity sleeve.",
        attachments: [], createdAt: "2026-08-28T13:07:00Z",
      },
    ],
  },
];
