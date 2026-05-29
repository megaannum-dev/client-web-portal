"use client";

import { createContext, useContext } from "react";

/** True = fully expanded, false = collapsed to icon rail. */
export const SidebarContext = createContext<boolean>(true);

export function useSidebarOpen() {
  return useContext(SidebarContext);
}
