/** Up to two initials for an avatar, or "?" when there is no name. */
export function initials(name: string | null): string {
  return (
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}
