"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { RequestTicketsInbox } from "@/components/rm/RequestTickets";

export default function RequestTicketsPage() {
  return (
    <div className="mx-auto">
      <div className="mb-7">
        <PageHeader
          title="Request Tickets"
          subtitle="Requests raised by your clients. Open each one to act on the client's behalf."
        />
      </div>
      <RequestTicketsInbox />
    </div>
  );
}
