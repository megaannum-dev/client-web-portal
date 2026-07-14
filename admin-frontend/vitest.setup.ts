import "@testing-library/jest-dom/vitest";

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
