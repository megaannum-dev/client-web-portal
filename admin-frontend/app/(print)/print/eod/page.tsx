import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getEodReport } from "@/app/(roles)/mobo/daily-exception-report/actions";

// Server-only print route for ChromiumRenderer (BE-9). Lives outside (roles)
// so AuthGuard/DashboardShell never wrap it — token header is the only gate.
export default async function EodPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ trade_date?: string }>;
}) {
  const token = (await headers()).get("x-eod-render-token");
  if (!token || token !== process.env.PDF_RENDER_TOKEN) notFound();

  const { trade_date } = await searchParams;
  const result = await getEodReport(trade_date);
  if (!result.success) notFound();

  const data = result.data;

  return (
    <div style={{ background: "#fff", padding: 32 }}>
      <h1>Daily Exception Report — {data.settleDay}</h1>
      <p>Trade date: {data.tradeDate}</p>
      <p>Orders: {data.orderCount}</p>
      <p>Break total: {data.breakTotal}</p>
      <p>Outcome: {data.outcome}</p>
      <p>Status: {data.status}</p>
    </div>
  );
}
