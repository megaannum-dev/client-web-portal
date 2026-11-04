"use client";

// Reject control that collects the (required) reason the API demands.
import { useState } from "react";
import { X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

export function RejectReason({ onReject }: { onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return <Button variant="secondary" icon={X} onClick={() => setOpen(true)}>Reject</Button>;
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Reason for rejection"
        aria-label="Reason for rejection"
        className="box-border w-full resize-y rounded border border-outline-variant px-3 py-2.5 text-[14px] leading-[1.55] text-on-surface outline-none"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setOpen(false); setReason(""); }}>Cancel</Button>
        <Button icon={X} disabled={!reason.trim()} onClick={() => onReject(reason.trim())}>Confirm reject</Button>
      </div>
    </div>
  );
}
