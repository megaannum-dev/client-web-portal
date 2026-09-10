// 021 FE-1 — the wire -> view-model adapter (client portal shape).
import { describe, expect, it } from "vitest";
import {
  attachmentKind,
  formatBytes,
  groupByDay,
  localIso,
  toViewMessage,
} from "@/lib/chat/adapter";
import type { ChatMessageDTO } from "@/lib/api/chat";

function dto(over: Partial<ChatMessageDTO> = {}): ChatMessageDTO {
  return {
    id: "m1",
    client_id: "c1",
    sender_uid: "uid-rm",
    sender_name: "Sarah Mitchell",
    sender_role: "rm",
    body: "Hello",
    attachments: [],
    created_at: "2026-07-18T08:05:00Z",
    ...over,
  };
}

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [286 * 1024, "286 KB"],
    [Math.round(1.4 * 1024 * 1024), "1.4 MB"],
  ])("%i -> %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it("a null size (the DTO allows it) renders as empty, not 'NaN'", () => {
    expect(formatBytes(null)).toBe("");
  });
});

describe("attachmentKind — icon only; content_type is untrusted", () => {
  it.each([
    ["application/pdf", "Q2_Review_Pack.pdf", "file-text"],
    ["text/csv", "trades.csv", "sheet"],
    ["application/octet-stream", "signed.p7s", "file-check"],
    [null, "Performance_Attribution.xlsx", "sheet"],
    [null, "no-extension", "file-check"],
  ])("(%s, %s) -> %s", (mime, name, expected) => {
    expect(attachmentKind(mime as string | null, name)).toBe(expected);
  });
});

describe("toViewMessage", () => {
  it("own flips only when sender_uid matches the viewer", () => {
    expect(toViewMessage(dto({ sender_uid: "me" }), "me").own).toBe(true);
    expect(toViewMessage(dto({ sender_uid: "other" }), "me").own).toBe(false);
    expect(toViewMessage(dto(), null).own).toBe(false);
  });

  it("sender_role passes straight through — the seat is derived server-side", () => {
    expect(toViewMessage(dto({ sender_role: "assistant" }), null).role).toBe("assistant");
  });

  it("carries a pre-formatted 24h time, which this app's bubble renders directly", () => {
    const at = new Date(2026, 6, 18, 16, 8);
    expect(toViewMessage(dto({ created_at: at.toISOString() }), null).time).toBe("16:08");
  });
});

describe("grouping is by LOCAL calendar day, not UTC", () => {
  it("localIso reads the viewer's own date parts", () => {
    expect(localIso(new Date(2026, 6, 18, 23, 30))).toBe("2026-07-18");
  });

  it("same local day -> one bucket, under `msgs`", () => {
    const a = toViewMessage(dto({ id: "a", created_at: new Date(2026, 6, 18, 9, 5).toISOString() }), null);
    const b = toViewMessage(dto({ id: "b", created_at: new Date(2026, 6, 18, 16, 8).toISOString() }), null);
    const days = groupByDay([a, b]);
    expect(days).toHaveLength(1);
    expect(days[0].iso).toBe("2026-07-18");
    expect(days[0].msgs.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("a local-midnight boundary splits into two days", () => {
    const late = toViewMessage(dto({ id: "late", created_at: new Date(2026, 6, 18, 23, 59).toISOString() }), null);
    const early = toViewMessage(dto({ id: "early", created_at: new Date(2026, 6, 19, 0, 1).toISOString() }), null);
    expect(groupByDay([late, early]).map((d) => d.iso)).toEqual(["2026-07-18", "2026-07-19"]);
  });

  it("no `label` is precomputed — AdvisoryRoom derives it, so a tab left open past midnight stays correct", () => {
    const days = groupByDay([toViewMessage(dto(), null)]);
    expect(days[0]).not.toHaveProperty("label");
  });
});
