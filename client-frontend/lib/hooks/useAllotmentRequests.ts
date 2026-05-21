"use client";

import { useEffect, useState } from "react";
import { STORE_KEYS, type AllotmentRequest } from "@/lib/mock/data";

// TODO: replace with GET /api/client/allotment-requests
export function useAllotmentRequests() {
  const [dynamic, setDynamic] = useState<AllotmentRequest[]>([]);

  useEffect(() => {
    const stored: AllotmentRequest[] = JSON.parse(
      localStorage.getItem(STORE_KEYS.allotmentRequests) ?? "[]",
    );
    setDynamic(stored);
  }, []);

  function addRequest(req: AllotmentRequest) {
    setDynamic((prev) => [req, ...prev]);
  }

  return { dynamic, addRequest };
}
