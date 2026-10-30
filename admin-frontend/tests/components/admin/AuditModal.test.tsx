// AuditModal lazy-loads older audit pages when its bottom sentinel scrolls into view.
// jsdom has no IntersectionObserver, so a controllable stub stands in for it.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStore = vi.hoisted(() => ({ audit: [] as unknown[] }));
const getAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/AdminStoreContext", () => ({ useAdminStore: () => mockStore }));
vi.mock("@/app/(roles)/admin/actions", () => ({ getAudit }));

import { AuditModal } from "@/components/admin/AuditModal";

type Observer = { cb: IntersectionObserverCallback; live: boolean };
let observers: Observer[] = [];
class FakeIntersectionObserver {
  private rec: Observer;
  constructor(cb: IntersectionObserverCallback) {
    this.rec = { cb, live: true };
    observers.push(this.rec);
  }
  observe() {}
  unobserve() {}
  disconnect() { this.rec.live = false; }
}
/** Fire every live observer as "sentinel is on screen". */
async function sentinelVisible() {
  await act(async () => {
    observers.filter((o) => o.live).forEach((o) => o.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
  });
}

// Newest-first rows: row(0) is the newest.
const row = (i: number) => ({
  id: `r${i}`,
  at: new Date(Date.UTC(2026, 6, 1, 12, 0, 0) - i * 60_000).toISOString(),
  actor_name: "Ada Admin",
  event: `ev${i}`,
  detail: `detail-${i}`,
});
const rows = (from: number, n: number) => Array.from({ length: n }, (_, k) => row(from + k));

async function renderModal() {
  const view = render(<AuditModal onClose={vi.fn()} />);
  await screen.findByText("Audit log");
  return view;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="content-overlay-root"></div>';
  observers = [];
  getAudit.mockReset();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => vi.unstubAllGlobals());

describe("AuditModal lazy paging", () => {
  it("fetches the next page with before = the last row's at, and appends it", async () => {
    mockStore.audit = rows(0, 50);
    getAudit.mockResolvedValue({ success: true, data: rows(50, 3) });
    await renderModal();

    await sentinelVisible();

    expect(getAudit).toHaveBeenCalledTimes(1);
    expect(getAudit).toHaveBeenCalledWith({ limit: 50, before: row(49).at });
    expect(await screen.findByText("detail-52")).toBeTruthy();
    expect(screen.getByText("detail-0")).toBeTruthy();
  });

  it("a short page stops further fetches", async () => {
    mockStore.audit = rows(0, 50);
    getAudit.mockResolvedValue({ success: true, data: rows(50, 3) });
    await renderModal();

    await sentinelVisible();
    await sentinelVisible();

    expect(getAudit).toHaveBeenCalledTimes(1);
  });

  it("a full page keeps going from the new last row", async () => {
    mockStore.audit = rows(0, 50);
    getAudit
      .mockResolvedValueOnce({ success: true, data: rows(50, 50) })
      .mockResolvedValueOnce({ success: true, data: [] });
    await renderModal();

    await sentinelVisible();
    await screen.findByText("detail-99");
    await sentinelVisible();

    expect(getAudit).toHaveBeenCalledTimes(2);
    expect(getAudit).toHaveBeenLastCalledWith({ limit: 50, before: row(99).at });
  });

  it("does not load at all when the store holds less than a full page", async () => {
    mockStore.audit = rows(0, 10);
    await renderModal();

    await sentinelVisible();

    expect(getAudit).not.toHaveBeenCalled();
  });

  it("keeps older pages, without duplicates, when the store list is refreshed", async () => {
    mockStore.audit = rows(0, 50);
    getAudit.mockResolvedValue({ success: true, data: rows(50, 50) });
    const { rerender } = await renderModal();
    await sentinelVisible();
    await screen.findByText("detail-99");

    // refreshAudit: one new entry on top, the store's newest-50 window shifts by one
    mockStore.audit = [{ ...row(0), id: "new", event: "evNew", detail: "detail-new" }, ...rows(0, 49)];
    rerender(<AuditModal onClose={vi.fn()} />);

    expect(await screen.findByText("detail-new")).toBeTruthy();
    expect(screen.getByText("detail-99")).toBeTruthy();
    expect(screen.getByText("detail-49")).toBeTruthy(); // dropped out of the store window, still shown
    expect(screen.getAllByText("detail-0")).toHaveLength(1);
    expect(screen.getAllByText("detail-60")).toHaveLength(1);
  });

  it("shows an error and stops after a failed fetch, leaving the list as it was", async () => {
    mockStore.audit = rows(0, 50);
    getAudit.mockResolvedValue({ success: false, error: "boom", code: "HTTP_500" });
    await renderModal();

    await sentinelVisible();
    await sentinelVisible();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(getAudit).toHaveBeenCalledTimes(1);
    expect(screen.getByText("detail-49")).toBeTruthy();
  });
});
