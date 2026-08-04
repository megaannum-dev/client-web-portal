import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// ponytail: server/api-client.ts self-guards with the "server-only" package so
// it can't leak into a client bundle. That guard trips for real in jsdom the
// moment a partial vi.mock's importOriginal() pulls in the real module chain
// (hooks/actions -> server/* -> server-only). Neutralize the package here so
// importOriginal-based partial mocks can resolve the untouched real exports
// without executing a request; upgrade to real "server-only" behavior only if
// a test ever needs to assert the guard itself fires.
vi.mock("server-only", () => ({}));

// ponytail: jsdom has no ResizeObserver; Recharts (StackedBarChart) needs one
// to mount without throwing. Upgrade to a real polyfill if a test ever needs
// actual resize callbacks.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
