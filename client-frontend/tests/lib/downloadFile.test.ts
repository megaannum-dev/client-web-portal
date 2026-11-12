import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAs } from "@/lib/downloadFile";

function stubFetch(headers: Record<string, string>) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 200, headers })));
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  let name = "";
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    name = this.download;
  });
  return () => name;
}

describe("downloadAs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prefers the Content-Disposition filename", async () => {
    const saved = stubFetch({ "Content-Disposition": 'attachment; filename="real.pdf"' });
    await downloadAs("/u", "fallback.pdf");
    expect(saved()).toBe("real.pdf");
  });

  it("falls back to the filename argument", async () => {
    const saved = stubFetch({});
    await downloadAs("/u", "fallback.pdf");
    expect(saved()).toBe("fallback.pdf");
  });
});
