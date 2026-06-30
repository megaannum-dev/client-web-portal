const PC = "/api/pc";

export const ENDPOINTS = {
  PC: {
    MODELS:              `${PC}/models`,
    MODEL:               (id: string) => `${PC}/models/${id}`,
    MATERIALS:           (id: string) => `${PC}/models/${id}/materials`,
    DOWNLOAD:            (id: string, mid: string) => `${PC}/models/${id}/materials/${mid}/download`,
    CHANGES:             (id: string) => `${PC}/models/${id}/changes`,
    PUBLISH:             (id: string) => `${PC}/models/${id}/publish`,
    DELETE:              (id: string) => `${PC}/models/${id}`,
    ALLOCATION:          `${PC}/allocation`,
    PERIODS:             `${PC}/allocation/periods`,
    CONFIRM:             (id: string) => `${PC}/allocation/periods/${id}/confirm`,
  },
} as const;
