const PC = "/api/pc";
const RM = "/api/rm";
const MOBO = "/api/mobo";
const COMPLIANCE = "/api/compliance";

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
    ALLOTMENTS:      `${PC}/allotments`,
    ALLOTMENT_ACK:   (id: string) => `${PC}/allotments/${id}/acknowledge`,
  },
  RM: {
    CLIENTS: `${RM}/clients`,
    CLIENT:  (id: string) => `${RM}/clients/${encodeURIComponent(id)}`,
    ONBOARDINGS:      `${RM}/onboardings`,
    ONBOARDING:       (id: string) => `${RM}/onboardings/${id}`,
    ONBOARDING_DOC:   (id: string, docType: string) => `${RM}/onboardings/${id}/documents/${encodeURIComponent(docType)}`,
    ONBOARDING_SUBMIT:(id: string) => `${RM}/onboardings/${id}/submit`,
    ONBOARDING_RM_OPTIONS: `${RM}/onboardings/rm-options`,
    ONBOARDING_DOC_SPECS: `${RM}/onboardings/doc-specs`,
    ONBOARDING_BY_CLIENT: (clientId: string) => `${RM}/onboardings/by-client/${encodeURIComponent(clientId)}`,
    CLIENT_EVENTS:        (clientId: string) => `${RM}/clients/${encodeURIComponent(clientId)}/events`,
    SUBSCRIPTIONS:            `${RM}/subscriptions`,
    SUBSCRIPTION_ALLOTMENTS:  (clientId: string) => `${RM}/subscriptions/${encodeURIComponent(clientId)}/allotments`,
  },
  MOBO: {
    PTA:      `${MOBO}/post-trade-allocation`,
    PTA_RUNS: `${MOBO}/post-trade-allocation/runs`,
    PTA_RUN:  `${MOBO}/post-trade-allocation/run`,
    RECONCILIATION: `${MOBO}/reconciliation`,
  },
  COMPLIANCE: {
    ONBOARDINGS:        `${COMPLIANCE}/onboardings`,
    ONBOARDING_DOWNLOAD:(id: string, docType: string) => `${COMPLIANCE}/onboardings/${id}/documents/${encodeURIComponent(docType)}/download`,
    ONBOARDING_VERDICT: (id: string, docType: string) => `${COMPLIANCE}/onboardings/${id}/documents/${encodeURIComponent(docType)}/verdict`,
    ONBOARDING_APPROVE: (id: string) => `${COMPLIANCE}/onboardings/${id}/approve`,
    ONBOARDING_REJECT:  (id: string) => `${COMPLIANCE}/onboardings/${id}/reject`,
  },
} as const;
