/** Fetch a URL as a blob and hand it to the browser as a save.
 *
 *  `headers` exists for endpoints behind HTTPBearer — notably
 *  GET /api/chat/attachments/{id}, which 401s a bare <a href> because a plain
 *  navigation carries no Authorization header. */
export async function downloadAs(
  url: string,
  filename: string,
  headers?: Record<string, string>,
): Promise<void> {
  const res  = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
