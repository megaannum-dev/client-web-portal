"use client";

// 021 U11 — click-to-download for a chat attachment.
//
// The route is HTTPBearer-gated and always answers
// `Content-Disposition: attachment`, so a plain <a href> would 401: a browser
// navigation carries no Authorization header. Hence a blob fetch.

import { useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { downloadAttachment } from "@/lib/api/chat";

export function useAttachmentDownload(): (attachment: { id: string; name: string }) => void {
  const { getIdToken } = useAuth();
  return useCallback(
    (attachment) => {
      // Optimistic attachments carry a synthetic id and do not exist server
      // side yet; the real DTO replaces them a moment later.
      if (attachment.id.startsWith("temp:")) return;
      void (async () => {
        const token = await getIdToken();
        await downloadAttachment(token, attachment.id, attachment.name);
      })();
    },
    [getIdToken],
  );
}
