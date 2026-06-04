interface AvatarProps {
  initial?: string;
  size?: number;
}

export function Avatar({ initial = "?", size = 40 }: AvatarProps) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full shadow-card"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg,#fef08a,#86efac,#0d9488)",
      }}
    >
      <span
        className="font-bold uppercase"
        style={{ fontSize: size * 0.34, color: "rgba(255,255,255,.85)" }}
      >
        {initial}
      </span>
    </div>
  );
}
