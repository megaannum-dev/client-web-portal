import { getApiBase } from "@/lib/auth-api";

export interface PositionDTO {
  model_id: string;
  model_name: string;
  units: number;
  amount: number;
  model_limit: number | null;
  model_size: number | null;
  ib_account: string | null;
  category: string[] | null;
  has_material: boolean;
}

export interface PortfolioDTO {
  cash_deposit: number;
  amount_in_trade: number;
  previous_amount_in_trade: number;
  total_value: number;
  change_amount: number;
  change_pct: number | null;
  updated_at: string | null;
  positions: PositionDTO[];
}

export interface HistoryPointDTO {
  month: string; // "YYYY-MM"
  total: number;
  per_model: Record<string, number>; // model_name -> cumulative
}

async function authedGet<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: unknown = await res.json();
      if (typeof body === "object" && body !== null && "detail" in body) {
        const d = (body as { detail?: unknown }).detail;
        if (typeof d === "string") detail = d;
      }
    } catch { /* noop */ }
    throw new Error(`${detail} (${res.status} ${path})`);
  }
  return (await res.json()) as T;
}

/** GET /api/client/portfolio */
export async function fetchPortfolio(token: string | null): Promise<PortfolioDTO> {
  return authedGet<PortfolioDTO>("/api/client/portfolio", token);
}

/** GET /api/client/portfolio/history?months=<months> (default 6) */
export async function fetchPortfolioHistory(token: string | null, months = 6): Promise<HistoryPointDTO[]> {
  return authedGet<HistoryPointDTO[]>(`/api/client/portfolio/history?months=${months}`, token);
}
