"use client";

import { useParams, notFound } from "next/navigation";
import { RequestTicketDetail } from "@/components/rm/RequestTickets";
import { useRmTicket } from "@/hooks/api/useRmTickets";
import RequestTicketDetailSkeleton from "./Skeleton";

export default function RequestTicketDetailPage() {
  const { ref } = useParams<{ ref: string }>();
  const { data: ticket, loading, error, refetch } = useRmTicket(ref);

  if (loading && !ticket) return <RequestTicketDetailSkeleton />;

  if (!ticket && !error) notFound(); // Next.js 404

  if (error || !ticket) {
    return (
      <div className="mx-auto px-5 py-16 text-center text-[13px] font-medium text-error">
        {error ?? "Not found"}
      </div>
    );
  }

  return (
    <div className="mx-auto">
      <RequestTicketDetail ticket={ticket} onRefetch={refetch} />
    </div>
  );
}
