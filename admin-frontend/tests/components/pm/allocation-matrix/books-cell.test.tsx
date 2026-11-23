import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailPanel } from "@/components/pm/allocation-matrix/DetailPanel";
import { HowToRead } from "@/components/pm/allocation-matrix/HowToRead";
import { Matrix } from "@/components/pm/allocation-matrix/Matrix";
import type { AllocationView } from "@/lib/pm/allocation";
import type { BookCode } from "@/lib/pm/types";

type BookAccount = { book: BookCode; account: string | null };

const THREE: BookAccount[] = [
  { book: "dt", account: "U1111111" },
  { book: "pt", account: "U2222222" },
  { book: "inb", account: "U3333333" },
];

const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

function viewFor(books: BookCode[], accounts: BookAccount[]): AllocationView {
  const model = {
    id: "m1",
    name: "Alpha",
    size: 1000,
    live: true,
    masterIb: "F1111111",
    requiredBooks: books,
  };
  const client = { id: "c1", name: "Ada" };
  const cell = { units: 2, accounts };
  return {
    models: [model],
    clients: [client],
    liveModels: [model],
    periods: [],
    openPeriod: "Nov 2026",
    modelById: () => model,
    clientById: () => client,
    cell: () => cell,
    cellFund: () => 2000,
    colUnits: () => 2,
    colFund: () => 2000,
    totalFund: () => 2000,
    count: () => 1,
  };
}

function renderMatrix(books: BookCode[], accounts: BookAccount[]) {
  return render(
    <Matrix data={viewFor(books, accounts)} view="units" onOpen={() => {}} />,
  );
}

describe("allocation matrix books", () => {
  afterEach(() => {
    if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
  });

  it("shows one account line for a one-book model", () => {
    renderMatrix(["dt"], [{ book: "dt", account: "U1111111" }]);
    expect(screen.getAllByText("2×").length).toBeGreaterThan(0);
    expect(screen.getByText("U1111111")).toBeInTheDocument();
    expect(screen.getAllByText("DT")).toHaveLength(2);
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("stacks one line per book on a three-book model", () => {
    renderMatrix(["dt", "pt", "inb"], THREE);
    expect(screen.getByText("U1111111")).toBeInTheDocument();
    expect(screen.getByText("U2222222")).toBeInTheDocument();
    expect(screen.getByText("U3333333")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("collapses an overflowing stack to the first account and +N", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 80,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 16,
    });
    renderMatrix(["dt", "pt", "inb"], THREE);
    expect(screen.getByText("U1111111")).toBeInTheDocument();
    expect(screen.queryByText("U2222222")).not.toBeInTheDocument();
    expect(screen.queryByText("U3333333")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByTitle(/DT U1111111[\s\S]*PT U2222222[\s\S]*INB U3333333/)).toBeInTheDocument();
  });

  it("lists each required book in the detail panel, with a dash when the account is missing", () => {
    render(
      <DetailPanel
        data={viewFor(["dt", "pt"], [
          { book: "dt", account: "U1111111" },
          { book: "pt", account: null },
        ])}
        period="Nov 2026"
        cid="c1"
        mid="m1"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Client accounts")).toBeInTheDocument();
    expect(screen.getByText("Model IB account").parentElement).toHaveTextContent("F1111111");
    expect(screen.getByText("U1111111")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getAllByText("dedicated")).toHaveLength(2);
  });

  it("describes a cell as one dedicated account per book", () => {
    render(<HowToRead view="units" />);
    expect(screen.getByText(/dedicated account for each of the model.s books/)).toBeInTheDocument();
  });
});
