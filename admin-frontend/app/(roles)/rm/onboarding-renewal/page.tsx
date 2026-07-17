"use client";

import { useState } from "react";
import { UserRoundPlus } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { OnboardingBoard } from "@/components/rm/OnboardingBoard";
import { OnboardingModal } from "@/components/rm/OnboardingModal";

export default function OnboardingRenewalPage() {
  const [onboarding, setOnboarding] = useState(false);

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-7">
        <PageHeader
          title="Onboarding & Renewal"
          subtitle="Pipeline board — click any card to open its KYC & document panel."
          actions={<Button icon={UserRoundPlus} onClick={() => setOnboarding(true)}>Start Onboarding</Button>}
        />
      </div>
      <OnboardingBoard />
      {onboarding && <OnboardingModal onClose={() => setOnboarding(false)} />}
    </div>
  );
}
