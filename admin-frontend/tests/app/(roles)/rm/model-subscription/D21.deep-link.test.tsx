// D21 — a ticket deep link always carries the ticket ref into the subscription
// form, even when the client doesn't hold the ticket's model yet.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let params = new URLSearchParams();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/hooks/usePageAccess", () => ({ useCanEdit: () => true }));

const CLIENTS = [{
  id: "c-1", name: "Cathy Client", initials: "CC", mandate: "", aum: "",
  models: [{
    name: "Alpha", status: "Active", tone: "active", mgmtFee: "1%", incentiveFee: "10%",
    account: "U-1", modelId: "m-held", modelSize: 100_000, units: 2, txns: [],
  }],
}];
vi.mock("@/hooks/api/useSubscriptions", () => ({
  useSubscriptions: () => ({
    clients: CLIENTS, ensureAllotmentsLoaded: vi.fn(), refetch: vi.fn(), invalidateClientAllotments: vi.fn(),
  }),
}));
const MODELS = [
  { id: "m-held", name: "Alpha", size: 100_000, status: "live", mgmt_fee: 0.01, incentive_fee: 0.1 },
  { id: "m-new", name: "Beta", size: 250_000, status: "live", mgmt_fee: 0.015, incentive_fee: 0.2 },
];
vi.mock("@/hooks/api/useModels", () => ({ useModels: () => ({ data: MODELS }) }));
vi.mock("@/hooks/api/useClientBook", () => ({
  useClientBook: () => ({ data: [
    { id: "c-1", name: "Cathy Client" }, { id: "c-2", name: "Renny Renewal" }, { id: "c-3", name: "Nina New" },
  ] }),
}));
// c-2 is an approved client reopened for renewal; c-3 is still in first onboarding.
const BOARD = [{ label: "Pending", status: "pending_review", clients: [
  { userId: "c-2", kind: "renewal" }, { userId: "c-3", kind: "initial" },
] }];
vi.mock("@/hooks/api/useOnboardingBoard", () => ({ useOnboardingBoard: () => ({ data: BOARD }) }));
vi.mock("@/components/rm/SubscriptionAccordion", () => ({ SubscriptionAccordion: () => null }));

const modalProps = vi.fn();
vi.mock("@/components/rm/SubscriptionFormModal", () => ({
  SubscriptionFormModal: (props: unknown) => { modalProps(props); return <div data-testid="sub-modal" />; },
}));

import { toast } from "sonner";
import ModelSubscriptionPage from "@/app/(roles)/rm/model-subscription/page";

function lastModal() {
  return modalProps.mock.calls.at(-1)?.[0] as { mode: string; context: Record<string, unknown> };
}

describe("D21 Model Subscription ticket deep link", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("opens the locked mode for a model the client already holds", async () => {
    params = new URLSearchParams("client=c-1&model=m-held&mode=add-allotment&ticket=TCK-1&multiplier=3");
    render(<ModelSubscriptionPage />);
    await screen.findByTestId("sub-modal");
    expect(lastModal().mode).toBe("add-allotment");
    expect(lastModal().context).toMatchObject({ clientId: "c-1", modelId: "m-held", multiplier: 3, sourceTicketRef: "TCK-1" });
  });

  it("falls back to New Subscription, still linked to the ticket, for a model the client doesn't hold", async () => {
    params = new URLSearchParams("client=c-1&model=m-new&mode=add-allotment&ticket=TCK-2&multiplier=4");
    render(<ModelSubscriptionPage />);
    await screen.findByTestId("sub-modal");
    expect(lastModal().mode).toBe("new-subscription");
    expect(lastModal().context).toMatchObject({ clientId: "c-1", modelId: "m-new", modelName: "Beta", multiplier: 4, sourceTicketRef: "TCK-2" });
  });

  it("does the same for a client with no subscriptions at all", async () => {
    params = new URLSearchParams("client=c-9&model=m-new&mode=add-allotment&ticket=TCK-3");
    render(<ModelSubscriptionPage />);
    await screen.findByTestId("sub-modal");
    expect(lastModal()).toMatchObject({ mode: "new-subscription", context: { clientId: "c-9", sourceTicketRef: "TCK-3" } });
  });

  it("pre-fills a redemption with the unsigned ticket multiplier", async () => {
    params = new URLSearchParams("client=c-1&model=m-held&mode=redemption&ticket=TCK-5&multiplier=-1");
    render(<ModelSubscriptionPage />);
    await screen.findByTestId("sub-modal");
    expect(lastModal()).toMatchObject({ mode: "redemption", context: { multiplier: 1 } });
  });

  it("offers clients reopened for renewal but not those still in first onboarding", async () => {
    params = new URLSearchParams("client=c-2&model=m-new&mode=add-allotment&ticket=TCK-6");
    render(<ModelSubscriptionPage />);
    await screen.findByTestId("sub-modal");
    const ids = (modalProps.mock.calls.at(-1)?.[0] as { availableClients: { id: string }[] }).availableClients.map((c) => c.id);
    expect(ids).toEqual(["c-1", "c-2"]);
  });

  it("shows an error instead of silently dropping a redemption ticket for a model not held", async () => {
    params = new URLSearchParams("client=c-1&model=m-new&mode=redemption&ticket=TCK-4");
    render(<ModelSubscriptionPage />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("TCK-4")));
    expect(screen.queryByTestId("sub-modal")).not.toBeInTheDocument();
  });
});
