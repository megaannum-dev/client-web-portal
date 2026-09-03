// 021 UI-2 — the /messaging page: room chrome, thread, docs aside, composer.
// Presentation only — messages/participants are unbound (empty), onSend/
// onAttach are unwired seams the next branch fills in.
"use client";

import { AdvisoryRoom } from "@/components/messaging/AdvisoryRoom";

export default function MessagingPage() {
  return (
    // The design's messages screen is `position:absolute;inset:0` inside a
    // main that deliberately covers its own padding (plan §3). This app's
    // <main> is `flex-1 p-8`, un-constrained in height and not `relative` —
    // making it either would change scrolling on all six other pages. So
    // the page escapes its own padding instead: `-m-8` cancels main's p-8,
    // and `h-[calc(100vh-4rem)]` (4rem = header-h) fills the region under
    // the header.
    <div className="-m-8 h-[calc(100vh-4rem)]">
      <AdvisoryRoom messages={[]} participants={[]} />
    </div>
  );
}
