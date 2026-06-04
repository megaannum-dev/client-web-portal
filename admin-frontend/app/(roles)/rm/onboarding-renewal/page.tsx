"use client";

import { UserRoundPlus } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { OnboardingBoard } from "@/components/rm/OnboardingBoard";

export default function OnboardingRenewalPage() {
  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-7">
        <PageHeader
          title="Onboarding & Renewal"
          subtitle="Pipeline board — click any card to open its KYC & document panel."
          actions={<Button icon={UserRoundPlus}>Start Onboarding</Button>}
        />
      </div>
      <OnboardingBoard />
    </div>
  );
}
