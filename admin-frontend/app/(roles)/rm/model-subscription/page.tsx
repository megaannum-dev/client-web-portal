"use client";

import { Plus } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { SubscriptionAccordion } from "@/components/rm/SubscriptionAccordion";
import { SUB_CLIENTS } from "@/lib/mock/rm-data";

export default function ModelSubscriptionPage() {
  const totalClients = SUB_CLIENTS.length;
  const totalModels = SUB_CLIENTS.reduce((s, c) => s + c.models.length, 0);
  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-7">
        <PageHeader
          title="Model Subscription"
          subtitle={`Client book → subscribed models → full transaction history. ${totalClients} clients · ${totalModels} subscriptions.`}
          actions={<Button icon={Plus}>Subscribe Client</Button>}
        />
      </div>
      <SubscriptionAccordion />
    </div>
  );
}
