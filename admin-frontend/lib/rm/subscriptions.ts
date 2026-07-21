// FE-6 — pure DTO->view mapping, no fetch logic, mirroring lib/pc/models.ts's
// mapDtoToModel convention. Reuses the EXISTING SubClient/SubModel/TxnRow
// types from lib/mock/rm-data.ts verbatim -- this file produces values of
// those types, it does not redefine them.
import { fmtMoney, fmtMoneyShort, fmtTimestamp } from "@/lib/pc/format";
import type { ClientSubscriptionsDTO, AllotRdmptDTO } from "@/lib/onboarding/types";
import type { SubClient, SubModel, TxnRow } from "@/lib/mock/rm-data";

/** "Ardent Capital Partners" -> "AC" — first letter of the first two words,
 *  matching the mock's own `initials` convention exactly. */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "");
  return letters ? letters.toUpperCase() : "—";
}

/** "0.015" (Decimal-as-fraction, per §3.1's JSON-number convention) -> "1.5%".
 *  parseFloat after toFixed(2) trims trailing zeros (10 -> "10", not "10.00"). */
function formatFeePercent(fraction: number): string {
  return `${parseFloat((fraction * 100).toFixed(2))}%`;
}

/** One client's summary "Net" row — sourced from the AUTHORITATIVE current
 *  state (ClientSubscriptionRowDTO.units/amount), never re-derived by summing
 *  the ledger. This guarantees the Net row can never drift from what
 *  client_subscriptions actually holds, even before allotment history has
 *  loaded. */
function netRow(sub: ClientSubscriptionsDTO["subscriptions"][number]): TxnRow {
  // Decimal fields arrive over JSON as strings (see lib/pc/models.ts's
  // `Number(dto.model_size ?? 0)` for the same coercion) -- Number() first,
  // or toLocaleString()/template interpolation just echoes the raw string.
  const amt = Number(sub.amount).toLocaleString("en-US");
  return ["Net", "", "", "", amt, `${Number(sub.units)}×`, amt, "", ""];
}

/** One ledger entry -> one TxnRow. Cash Amt and Notional are the SAME number
 *  for live data (the backend has no separately-negotiated cash figure distinct
 *  from units × model_size, unlike a few of the mock's illustrative rows) --
 *  this is a real, stated simplification, not a bug. Currency is always "USD":
 *  no currency field exists anywhere in the schema yet (the mock's CHF/AUD rows
 *  are decorative and have no backing concept to preserve). Dates are formatted
 *  with the SAME fmtTimestamp already used for this exact DTO's fields on the
 *  PC allotments page (AllotTable.tsx) — the mock's placeholder "DD/MM/YYYY"
 *  strings are not a convention worth preserving once real data is behind it. */
export function allotmentToTxnRow(dto: AllotRdmptDTO, ibAccount: string | null): TxnRow {
  const isRedemption = dto.kind === "redemption";
  const amt = fmtMoney(dto.amount).slice(1); // fmtMoney prepends "$"; TxnRow cells don't (Ccy is its own column)
  const signedAmt = isRedemption ? `(${amt})` : amt;
  const mult = `${isRedemption ? "−" : ""}${dto.units}×`;
  const expected = dto.expected_cash_in ? fmtTimestamp(dto.expected_cash_in) : "—";
  return [
    isRedemption ? "Redemption" : "Allotment",
    fmtTimestamp(dto.created_at),
    ibAccount ?? "—",
    "USD",
    signedAmt,
    mult,
    signedAmt,                       // Cash Amt === Notional for live rows — see note above
    isRedemption ? "—" : expected,   // Expected Cash In
    isRedemption ? expected : "—",   // Expected Redemption
  ];
}

/**
 * `ClientSubscriptionsDTO[]` (+ optionally-loaded per-client allotment history)
 * -> `SubClient[]`, the EXACT type `SubscriptionAccordion.tsx` already renders.
 * `allotmentsByClient` is a cache keyed by `client_id`; a client not yet in the
 * cache renders with just its Net row per model (correct, just history-less) --
 * see FE-6's hook for when this cache is populated (lazily, on accordion open).
 */
export function mapSubscriptionsToSubClients(
  dtos: ClientSubscriptionsDTO[],
  allotmentsByClient: Record<string, AllotRdmptDTO[]>,
): SubClient[] {
  return dtos.map((c): SubClient => {
    const ledger = allotmentsByClient[c.client_id];
    const totalAum = c.subscriptions.reduce((s, sub) => s + Number(sub.amount), 0);
    return {
      id: c.client_id,
      name: c.client_name,
      initials: initialsFromName(c.client_name),
      // Every live client has signed the Discretionary PMS Service Agreement
      // (compliance_doc_config.py's REQUIRED_DOCS #1, MANDATORY for every
      // onboarding) — "Discretionary" is a true fact about every real client
      // here, not an invented label standing in for missing data.
      mandate: "Discretionary",
      aum: fmtMoneyShort(totalAum),
      models: c.subscriptions.map((sub): SubModel => {
        const ibAccount = sub.ib_account ?? null;
        const modelTxns = (ledger ?? [])
          .filter((a) => a.model_id === sub.model_id)
          .map((a) => allotmentToTxnRow(a, ibAccount));
        return {
          name: sub.model_name,
          // A client_subscriptions row only exists once onboarding is
          // APPROVED (013 _approve_initial) — there is no per-model
          // review/pending concept in the backend yet, so every live model
          // row is, by construction, Active. Add a real status source here
          // if/when one is modeled; don't invent one now.
          status: "Active",
          tone: "active",
          mgmtFee: formatFeePercent(sub.mgmt_fee),
          incentiveFee: formatFeePercent(sub.incentive_fee),
          account: ibAccount ?? "—",
          rows: ledger === undefined ? [netRow(sub)] : [...modelTxns, netRow(sub)],
        };
      }),
    };
  });
}
