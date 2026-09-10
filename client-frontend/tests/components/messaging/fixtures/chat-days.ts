// 021 UI-1 — CHAT_DAYS/CHAT_TEAM ported verbatim from the design source
// (client-messaging.txt lines 182-213, project 878b49b7). Test fixture ONLY —
// never imported by app code (plan §6: the port ships an empty thread, so
// these are the sole fidelity check).
export const CHAT_TEAM = { rm: "Sarah Mitchell", assistant: "Daniel Wu", client: "Alex Thompson" };

export const CHAT_DAYS = [
  { iso: "2026-07-18", label: "Fri, 18 Jul 2026", msgs: [
    { who: "assistant", t: "09:05", text: "Starting the annual KYC refresh today. I'll need a current ID scan and a proof of address dated within three months." },
    { who: "client", t: "11:40", text: "Sending both now.", doc: { name: "HKID_scan.pdf", kind: "file-check", size: "1.4 MB" } },
    { who: "client", t: "11:41", text: "And the utility bill for the registered address.", doc: { name: "Address_Proof_Jul26.pdf", kind: "file-text", size: "760 KB" } },
    { who: "assistant", t: "14:22", text: "Both received and logged against the checklist — nothing outstanding on your side.", doc: { name: "KYC_Checklist.pdf", kind: "file-text", size: "64 KB" } },
    { who: "rm", t: "16:08", text: "Thanks for turning that around so quickly. Compliance should clear it within the week." },
  ] },
  { iso: "2026-08-11", label: "Mon, 11 Aug 2026", msgs: [
    { who: "rm", t: "10:12", text: "The mandate amendment we discussed is ready for signature — it widens the FX hedging band to ±5%." },
    { who: "client", t: "15:30", text: "Signed and returned.", doc: { name: "Mandate_Amendment_signed.pdf", kind: "file-check", size: "96 KB" } },
    { who: "rm", t: "15:52", text: "Received. It takes effect from the next rebalance." },
  ] },
  { iso: "2026-08-28", label: "Thu, 28 Aug 2026", msgs: [
    { who: "rm", t: "08:30", text: "Quarterly review pack is out — headline is +3.2% against a +2.4% benchmark.", doc: { name: "Q2_Review_Pack.pdf", kind: "file-text", size: "2.1 MB" } },
    { who: "assistant", t: "08:34", text: "Attribution detail is in the workbook if you want the line-by-line.", doc: { name: "Performance_Attribution.xlsx", kind: "sheet", size: "188 KB" } },
    { who: "client", t: "13:07", text: "Read it over the weekend. Happy with the equity sleeve." },
  ] },
  { iso: "2026-09-01", label: "Yesterday", msgs: [
    { who: "assistant", t: "09:14", text: "Morning — the latest custody statement is uploaded to your document vault. Shout if anything looks off.", doc: { name: "Custody_Statement_Aug26.pdf", kind: "file-text", size: "412 KB" } },
    { who: "client", t: "10:02", text: "Thanks. One question on the FX leg — was the hedge rolled before the quarter close?" },
    { who: "rm", t: "10:26", text: "It was, on the 27th. I'll walk you through the roll cost on our call so you can see it against the mandate limit." },
  ] },
  { iso: "2026-09-02", label: "Today", msgs: [
    { who: "client", t: "08:41", text: "Perfect. Also — can we look at increasing the allocation to the balanced model this quarter?" },
  ] },
];
