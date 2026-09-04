// Rehydrate a base64 download payload into a Blob and trigger a save dialog.
export function saveBase64File(filename: string, contentType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/** Fetch a URL as a blob from the BROWSER and save it.
 *
 *  Sibling of saveBase64File, not a replacement: that one exists because its
 *  endpoints are reached through a server action, which base64s the bytes to
 *  cross the boundary. Chat attachments are fetched directly from the browser
 *  (the tab already holds the token for the WS ticket), so they need neither
 *  the round trip nor base64's ~33% inflation — but they do need the
 *  Authorization header a bare <a href> cannot send. */
export async function downloadAuthed(
  url: string,
  filename: string,
  headers?: Record<string, string>,
): Promise<void> {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
}
