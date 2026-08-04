import { render, type RenderOptions } from "@testing-library/react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import type { ReactElement } from "react";

/** Render inside a real AuthProvider seeded with a fixed portal user, so
 *  `useCanEdit`/`usePageAccess` resolve instead of throwing. */
export function renderWithAuth(ui: ReactElement, opts?: RenderOptions) {
  return render(<AuthProvider>{ui}</AuthProvider>, opts);
}
