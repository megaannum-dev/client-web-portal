// 021 UI-3 — AttachmentRow: the two tones (onDark vs normal) and the
// kind→icon lookup (a "sheet" attachment must resolve to FileSpreadsheet).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttachmentRow } from "@/components/rm/chat/AttachmentRow";
import type { ChatAttachment } from "@/components/rm/chat/types";

const fileTextDoc: ChatAttachment = { id: "a1", name: "Address_Proof_Jul26.pdf", kind: "file-text", size: "760 KB" };
const sheetDoc: ChatAttachment = { id: "a6", name: "Performance_Attribution.xlsx", kind: "sheet", size: "188 KB" };

describe("positive", () => {
  it("normal tone: surface-low background, outline-variant border, name + meta text", () => {
    const { container } = render(<AttachmentRow attachment={fileTextDoc} meta="760 KB · 11:41" />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-surface-low");
    expect(btn.className).toContain("border-outline-variant");
    expect(screen.getByText("Address_Proof_Jul26.pdf")).toBeInTheDocument();
    expect(screen.getByText("760 KB · 11:41")).toBeInTheDocument();
  });

  it("onDark tone: white-alpha background and border, no surface classes", () => {
    const { container } = render(<AttachmentRow attachment={fileTextDoc} meta="760 KB · 11:41" onDark />);
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("bg-white/[0.18]");
    expect(btn.className).toContain("border-white/40");
    expect(btn.className).not.toContain("bg-surface-low");
  });

  it("a sheet attachment resolves a different glyph than a file-text attachment (FileSpreadsheet vs FileText)", () => {
    const { container: textContainer } = render(
      <AttachmentRow attachment={fileTextDoc} meta="760 KB · 11:41" />,
    );
    const { container: sheetContainer } = render(
      <AttachmentRow attachment={sheetDoc} meta="188 KB · shared by Daniel Wu" />,
    );
    const textKindSvg = textContainer.querySelectorAll("svg")[0];
    const sheetKindSvg = sheetContainer.querySelectorAll("svg")[0];
    expect(sheetKindSvg.innerHTML).not.toBe(textKindSvg.innerHTML);
    expect(screen.getByText("Performance_Attribution.xlsx")).toBeInTheDocument();
    expect(screen.getByText("188 KB · shared by Daniel Wu")).toBeInTheDocument();
  });
});
