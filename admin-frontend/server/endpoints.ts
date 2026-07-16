const PC = "/api/pc";
const RM = "/api/rm";
const MOBO = "/api/mobo";

export const ENDPOINTS = {
  PC: {
    MODELS:              `${PC}/models`,
    MODEL:               (id: string) => `${PC}/models/${id}`,
    MATERIALS:           (id: string) => `${PC}/models/${id}/materials`,
    SYMBOLS:             (id: string) => `${PC}/models/${id}/symbols`,
    SYMBOL:              (id: string, sym: string) => `${PC}/models/${id}/symbols/${encodeURIComponent(sym)}`,
    DOWNLOAD:            (id: string, mid: string) => `${PC}/models/${id}/materials/${mid}/download`,
    CHANGES:             (id: string) => `${PC}/models/${id}/changes`,
    // PUBLISH removed — use MODEL(id) with PATCH {status:'live'} (D-1)
    // DELETE removed — use MODEL(id) with PATCH {status:'deleted'} (D-1)
    ALLOCATION:          `${PC}/allocation`,
    // PERIODS removed — periods are embedded in GET /allocation (D-2)
    // CONFIRM removed — use PATCH_PERIOD(id) with {status:'confirmed'} (D-3)
    PATCH_PERIOD:        (id: string) => `${PC}/allocation/periods/${id}`,
  },
  RM: {
    CLIENTS: `${RM}/clients`,
    CLIENT:  (id: string) => `${RM}/clients/${encodeURIComponent(id)}`,
  },
  MOBO: {
    PTA:      `${MOBO}/post-trade-allocation`,
    PTA_RUNS: `${MOBO}/post-trade-allocation/runs`,
    PTA_RUN:  `${MOBO}/post-trade-allocation/run`,
    RECONCILIATION: `${MOBO}/reconciliation`,
  },
} as const;
