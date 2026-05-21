"use client";

import { createContext, useContext, useState } from "react";

export type KycStatus = "due" | "processing" | "verified";

const KycContext = createContext<{
  kycStatus: KycStatus;
  setKycStatus: (s: KycStatus) => void;
}>({ kycStatus: "due", setKycStatus: () => {} });

export function KycProvider({ children }: { children: React.ReactNode }) {
  const [kycStatus, setKycStatus] = useState<KycStatus>("due");
  return (
    <KycContext.Provider value={{ kycStatus, setKycStatus }}>
      {children}
    </KycContext.Provider>
  );
}

export function useKycStatus() {
  return useContext(KycContext);
}
