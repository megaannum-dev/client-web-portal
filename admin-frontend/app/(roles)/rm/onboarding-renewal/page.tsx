"use client";

import { Suspense, useState } from "react";
import { UserRoundPlus } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { OnboardingBoard } from "@/components/rm/OnboardingBoard";
import { OnboardingModal } from "@/components/rm/OnboardingModal";
import { useOnboardingBoard } from "@/hooks/api/useOnboardingBoard";
import { useCanEdit } from "@/hooks/usePageAccess";

function OnboardingRenewalContent() {
  const [onboarding, setOnboarding] = useState(false);
  const board = useOnboardingBoard(); // single shared instance — lifted per §6 FE-1
  const canEdit = useCanEdit("rm.onboarding-renewal");

  return (
    <div className="mx-auto">
      <div className="mb-7">
        <PageHeader
          title="Onboarding & Renewal"
          subtitle="Pipeline board — click any card to open its KYC & document panel."
          /* View/Edit Gate Function */
          actions={canEdit && <Button icon={UserRoundPlus} onClick={() => setOnboarding(true)}>Start Onboarding</Button>}
        />
      </div>
      <OnboardingBoard {...board} />
      {canEdit && onboarding && (
        <OnboardingModal
          onClose={() => setOnboarding(false)}
          startOnboarding={board.startOnboarding}
          uploadDocument={board.uploadDocument}
          fetchRmOptions={board.fetchRmOptions}
          fetchDocSpecs={board.fetchDocSpecs}
        />
      )}
    </div>
  );
}

export default function OnboardingRenewalPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingRenewalContent />
    </Suspense>
  );
}
