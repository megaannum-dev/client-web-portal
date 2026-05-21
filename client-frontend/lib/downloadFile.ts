export async function downloadAs(url: string, filename: string): Promise<void> {
  const res  = await fetch(url);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
