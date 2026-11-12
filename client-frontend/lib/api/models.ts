import { getApiBase } from "@/lib/auth-api";
import { authedGet } from "@/lib/api/onboarding";
import { downloadAs } from "@/lib/downloadFile";

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

/** GET /api/client/models/{model_id}/material — Bearer-gated file stream, so it must go through fetch, not a link. */
export async function downloadModelMaterial(
  token: string | null,
  modelId: string,
  fallbackName: string,
): Promise<void> {
  await downloadAs(
    `${getApiBase()}/api/client/models/${modelId}/material`,
    fallbackName,
    token ? { Authorization: `Bearer ${token}` } : undefined,
  );
}
