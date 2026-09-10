// 021 UI-1 — AttachmentRow: width caps (260px bubble vs full-width list),
// icon-kind mapping, ellipsis rule, and the onDark tone.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttachmentRow } from "@/components/messaging/AttachmentRow";
import type { ChatAttachment } from "@/components/messaging/types";

const doc: ChatAttachment = { id: "a1", name: "Custody_Statement_Aug26.pdf", kind: "file-text", size: "412 KB" };

describe("UI-1 AttachmentRow", () => {
  it("bubble variant (default) caps at 260px, max-width 100%", () => {
    const { container } = render(<AttachmentRow attachment={doc} meta="412 KB · 09:14" />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("w-[260px]");
    expect(btn.className).toContain("max-w-full");
  });

  it("list (docs-aside) variant fills its container instead of the 260px cap", () => {
    const { container } = render(<AttachmentRow attachment={doc} meta="412 KB · shared by Daniel Wu" fullWidth />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("w-full");
    expect(btn.className).not.toContain("w-[260px]");
  });

  it("filename and meta render as passed, ellipsis rule applied via CSS classes", () => {
    render(<AttachmentRow attachment={doc} meta="412 KB · 09:14" />);
    const name = screen.getByText("Custody_Statement_Aug26.pdf");
    expect(name.className).toContain("overflow-hidden");
    expect(name.className).toContain("text-ellipsis");
    expect(name.className).toContain("whitespace-nowrap");
    expect(screen.getByText("412 KB · 09:14")).toBeInTheDocument();
  });

  it("onDark (own bubble) uses white-alpha fill/border, not surface-low", () => {
    const { container } = render(<AttachmentRow attachment={doc} meta="412 KB · 09:14" onDark />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-white/[0.16]");
    expect(btn.className).toContain("border-white/[0.32]");
    expect(btn.className).not.toContain("bg-surface-low");
  });

  it("default (not onDark) uses surface-low with an outline-variant border", () => {
    const { container } = render(<AttachmentRow attachment={doc} meta="412 KB · 09:14" />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-surface-low");
    expect(btn.className).toContain("border-outline-variant");
  });

  it.each([
    ["file-text", "lucide-file-text"],
    ["sheet", "lucide-file-spreadsheet"],
    ["file-check", "lucide-file-check-corner"], // FileCheck2's rendered class, despite the "2" in its name
  ] as const)("kind %s maps to the %s icon", (kind, expectedClass) => {
    const { container } = render(<AttachmentRow attachment={{ ...doc, kind }} meta="x" />);
    expect(container.querySelector(`.${expectedClass}`)).toBeTruthy();
  });
});
