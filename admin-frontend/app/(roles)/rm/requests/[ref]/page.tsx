"use client";

import { useParams, notFound } from "next/navigation";
import { RequestTicketDetail } from "@/components/rm/RequestTickets";
import { TICKET_QUEUE } from "@/lib/mock/rm-data";

export default function RequestTicketDetailPage() {
  const { ref } = useParams<{ ref: string }>();
  const ticket = TICKET_QUEUE.find((t) => t.ref === ref);

  if (!ticket) notFound(); // Next.js 404

  return (
    <div className="mx-auto">
      <RequestTicketDetail ticket={ticket} />
    </div>
  );
}
