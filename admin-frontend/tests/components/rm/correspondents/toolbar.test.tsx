import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CorrespondentsToolbar } from "@/components/rm/correspondents/CorrespondentsToolbar";
import { INITIAL_UI } from "@/components/rm/correspondents/toQuery";
import type { ChatDocumentSender } from "@/lib/api/chat";

const senders: ChatDocumentSender[] = [
  { uid: "u1", name: "Sam Client", role: "client", client_name: "Acme Ltd" },
  { uid: "u2", name: "Rita RM", role: "rm", client_name: null },
];

describe("Sender popover", () => {
  it("search never matches the text 'null' for staff", () => {
    render(<CorrespondentsToolbar ui={INITIAL_UI} setUi={vi.fn()} senders={senders} meUid={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Sender/ }));
    fireEvent.change(screen.getByLabelText("Find a sender"), { target: { value: "null" } });
    expect(screen.getByText("No senders")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a sender"), { target: { value: "acme" } });
    expect(screen.getByText("Sam Client")).toBeInTheDocument();
    expect(screen.queryByText("Rita RM")).toBeNull();
  });
});
