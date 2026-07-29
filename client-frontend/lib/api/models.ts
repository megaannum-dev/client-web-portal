import { getApiBase } from "@/lib/auth-api";
import { authedGet } from "@/lib/api/onboarding";

export interface RecommendedModelDTO {
  model_id: string;
  name: string;
  category: string[] | null;
  model_limit: number | null;
  model_size: number | null;
  subscription_redemption: string | null;
  description: string | null;
  has_material: boolean;
}

/** GET /api/client/models/recommended?include_subscribed=true|false */
export async function fetchRecommendedModels(token: string | null, includeSubscribed = false): Promise<RecommendedModelDTO[]> {
  const path = `/api/client/models/recommended${includeSubscribed ? "?include_subscribed=true" : ""}`;
  return authedGet<RecommendedModelDTO[]>(path, token);
}

/** GET /api/client/models/{model_id}/material — file stream, not JSON; caller fetches with a Bearer header. */
export function modelMaterialDownloadUrl(modelId: string): string {
  return `${getApiBase()}/api/client/models/${modelId}/material`;
}
