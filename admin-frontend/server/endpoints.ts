const PC = "/api/pc";

export const ENDPOINTS = {
  PC: {
    MODELS:              `${PC}/models`,
    MODEL:               (id: string) => `${PC}/models/${id}`,
    MATERIALS:           (id: string) => `${PC}/models/${id}/materials`,
    DOWNLOAD:            (id: string, mid: string) => `${PC}/models/${id}/materials/${mid}/download`,
    CHANGES:             (id: string) => `${PC}/models/${id}/changes`,
    PUBLISH:             (id: string) => `${PC}/models/${id}/publish`,
    ALLOCATION:          `${PC}/allocation`,
    PERIODS:             `${PC}/periods`,
    CONFIRM:             (id: string) => `${PC}/periods/${id}/confirm`,
  },
} as const;
