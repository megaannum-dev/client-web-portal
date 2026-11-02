import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SopUploadDialog } from "@/components/compliance/sop/SopUploadDialog";
import { SOP_MAX_BYTES, fileTooLargeError } from "@/lib/upload-limits";

/** A File whose reported size is `size` without allocating that many bytes. */
function fileOfSize(name: string, size: number): File {
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("fileTooLargeError", () => {
  it("accepts a file exactly at the limit and rejects one byte over", () => {
    expect(fileTooLargeError(fileOfSize("a.txt", SOP_MAX_BYTES), SOP_MAX_BYTES)).toBeNull();
    expect(fileTooLargeError(fileOfSize("a.txt", SOP_MAX_BYTES + 1), SOP_MAX_BYTES)).toBe(
      "File is too large. The limit is 50 MB.",
    );
  });
});

describe("SopUploadDialog size gate", () => {
  it("rejects an oversized file before any upload is attempted", () => {
    document.body.innerHTML = '<div id="content-overlay-root"></div>';
    const onSubmit = vi.fn();
    render(
      <SopUploadDialog
        defaultCategory="ad_hoc"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        uploaderName="Ann"
        uploaderRole="COMPLIANCE"
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [fileOfSize("big.txt", SOP_MAX_BYTES + 1)] } });

    expect(screen.getByText("File is too large. The limit is 50 MB.")).toBeInTheDocument();
    expect(screen.queryByText("big.txt")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
