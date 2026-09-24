import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormatBadge } from "@/components/compliance/ic-notes/FormatBadge";
import { UploadDialog } from "@/components/compliance/ic-notes/UploadDialog";

function pdfFile(name = "notes.pdf") {
  return new File(["x"], name, { type: "application/pdf" });
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("U4 IC notes components", () => {
  it("FormatBadge shows the uppercased extension for each format", () => {
    render(
      <>
        <FormatBadge filename="q3.pdf" />
        <FormatBadge filename="q3.docx" />
        <FormatBadge filename="q3.md" />
      </>,
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    expect(screen.getByText("MD")).toBeInTheDocument();
  });

  it("rejects a non-.pdf/.docx/.md file with the exact message", () => {
    render(
      <UploadDialog onClose={vi.fn()} onSubmit={vi.fn()} uploaderName="Jane PM" uploaderRole="PM" />,
    );
    const exe = new File(["x"], "malware.exe", { type: "application/octet-stream" });
    fireEvent.change(fileInput(), { target: { files: [exe] } });
    expect(screen.getByText("Only .pdf, .docx and .md files are supported.")).toBeInTheDocument();
  });

  it("blocks submit with a blank title", async () => {
    const onSubmit = vi.fn();
    render(
      <UploadDialog onClose={vi.fn()} onSubmit={onSubmit} uploaderName="Jane PM" uploaderRole="PM" />,
    );
    fireEvent.change(fileInput(), { target: { files: [pdfFile()] } });
    // clear the auto-filled title
    fireEvent.change(screen.getByDisplayValue("notes"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Enter a title.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a FormData with file/title/meeting_at on success and closes", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const onClose = vi.fn();
    render(
      <UploadDialog onClose={onClose} onSubmit={onSubmit} uploaderName="Jane PM" uploaderRole="PM" />,
    );
    fireEvent.change(fileInput(), { target: { files: [pdfFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const fd = onSubmit.mock.calls[0][0] as FormData;
    expect((fd.get("file") as File).name).toBe("notes.pdf");
    expect(fd.get("title")).toBe("notes");
    expect(typeof fd.get("meeting_at")).toBe("string");
    expect(() => new Date(fd.get("meeting_at") as string).toISOString()).not.toThrow();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows the backend error inline and stays open on failure", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: false, error: "File too large" });
    const onClose = vi.fn();
    render(
      <UploadDialog onClose={onClose} onSubmit={onSubmit} uploaderName="Jane PM" uploaderRole="PM" />,
    );
    fireEvent.change(fileInput(), { target: { files: [pdfFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("File too large")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
