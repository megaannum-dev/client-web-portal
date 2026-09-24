import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithAuth } from "@/tests/_helpers/renderWithAuth";
import type { IcNoteDTO } from "@/lib/ic-notes/types";

const NOTES: IcNoteDTO[] = [
  {
    id: "n-1", title: "Q3 Strategy Review", meeting_at: "2026-07-18T09:00:00Z",
    filename: "q3-notes.pdf", content_type: "application/pdf", size_bytes: 120_000,
    uploaded_by_uid: "u-1", uploaded_by_name: "Jane PM", uploaded_by_role: "PM",
    uploaded_by_email: "jane@example.com", uploaded_at: "2026-07-18T10:00:00Z",
  },
  {
    id: "n-2", title: "Risk Committee Minutes", meeting_at: "2026-08-02T09:00:00Z",
    filename: "risk-minutes.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 45_000,
    uploaded_by_uid: "u-2", uploaded_by_name: "Alex Compliance", uploaded_by_role: "COMPLIANCE",
    uploaded_by_email: null, uploaded_at: "2026-08-02T10:00:00Z",
  },
];

const listIcNotesAction = vi.fn();
const uploadIcNoteAction = vi.fn();
const downloadIcNoteAction = vi.fn();

vi.mock("@/app/(roles)/compliance/ic-notes/actions", () => ({
  listIcNotesAction: (...a: unknown[]) => listIcNotesAction(...a),
  uploadIcNoteAction: (...a: unknown[]) => uploadIcNoteAction(...a),
  downloadIcNoteAction: (...a: unknown[]) => downloadIcNoteAction(...a),
}));

function mockAuth(grant: "EDIT" | "VIEW") {
  vi.doMock("@/components/auth/AuthProvider", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/auth/AuthProvider")>()),
    useAuth: () => ({
      portalUser: {
        firebase_uid: "u-me", email: "me@example.com", name: "Current User", role: "COMPLIANCE",
        grants: { "compliance.ic-notes": grant },
      },
    }),
  }));
}

describe("U5 IC Meeting Notes page", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("shows Upload Notes for an EDIT grant", async () => {
    mockAuth("EDIT");
    listIcNotesAction.mockResolvedValue({ success: true, data: NOTES });
    const { default: Page } = await import("@/app/(roles)/compliance/ic-notes/page");
    renderWithAuth(<Page />);
    expect(await screen.findByText("Q3 Strategy Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload Notes" })).toBeInTheDocument();
  });

  it("hides Upload Notes for a VIEW grant", async () => {
    mockAuth("VIEW");
    listIcNotesAction.mockResolvedValue({ success: true, data: NOTES });
    const { default: Page } = await import("@/app/(roles)/compliance/ic-notes/page");
    renderWithAuth(<Page />);
    await screen.findByText("Q3 Strategy Review");
    expect(screen.queryByRole("button", { name: "Upload Notes" })).not.toBeInTheDocument();
  });

  it("search narrows the list to matching title/uploader", async () => {
    mockAuth("VIEW");
    listIcNotesAction.mockResolvedValue({ success: true, data: NOTES });
    const { default: Page } = await import("@/app/(roles)/compliance/ic-notes/page");
    renderWithAuth(<Page />);
    await screen.findByText("Q3 Strategy Review");
    fireEvent.change(screen.getByPlaceholderText("Search title or uploader…"), { target: { value: "risk" } });
    expect(screen.queryByText("Q3 Strategy Review")).not.toBeInTheDocument();
    expect(screen.getByText("Risk Committee Minutes")).toBeInTheDocument();
  });

  it("format filter narrows the list", async () => {
    mockAuth("VIEW");
    listIcNotesAction.mockResolvedValue({ success: true, data: NOTES });
    const { default: Page } = await import("@/app/(roles)/compliance/ic-notes/page");
    renderWithAuth(<Page />);
    await screen.findByText("Q3 Strategy Review");
    fireEvent.change(screen.getByDisplayValue("All formats"), { target: { value: "docx" } });
    expect(screen.queryByText("Q3 Strategy Review")).not.toBeInTheDocument();
    expect(screen.getByText("Risk Committee Minutes")).toBeInTheDocument();
  });

  it("view toggle switches card view to table view", async () => {
    mockAuth("VIEW");
    listIcNotesAction.mockResolvedValue({ success: true, data: NOTES });
    const { default: Page } = await import("@/app/(roles)/compliance/ic-notes/page");
    renderWithAuth(<Page />);
    await screen.findByText("Q3 Strategy Review");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Table view"));
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  });
});
