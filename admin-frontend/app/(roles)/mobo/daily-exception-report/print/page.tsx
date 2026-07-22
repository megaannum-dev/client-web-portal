import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getEodReport } from "@/app/(roles)/mobo/daily-exception-report/actions";

// Server component, no client hook, no sidebar/nav chrome. Reachable only by the
// exact URL ChromiumRenderer (BE-9) constructs — never linked from nav or page-config.
export default async function DailyExceptionReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ trade_date?: string }>;
}) {
  const token = (await headers()).get("x-eod-render-token");
  if (!token || token !== process.env.PDF_RENDER_TOKEN) notFound(); // 401-equivalent for a page route (Q-2, settled)

  const { trade_date } = await searchParams;
  const result = await getEodReport(trade_date);
  if (!result.success) notFound();

  const data = result.data;

  // ponytail: minimal self-contained JSX, not a shared ReportBody — FE-5 hasn't
  // cut over to real data yet, so there's no shared shape to extract. Factor into
  // lib/mobo/ReportBody once FE-5 lands (impl doc's own <TODO>, explicitly deferred).
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
