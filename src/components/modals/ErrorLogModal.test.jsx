import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";

const mockStreamStatusStore = vi.hoisted(() => ({
  streams: {},
  CheckStatus: vi.fn()
}));

vi.mock("@/stores/index.ts", () => ({streamStatusStore: mockStreamStatusStore}));

import ErrorLogModal from "@/components/modals/ErrorLogModal.jsx";

const renderModal = (props={}) => render(
  <MantineProvider>
    <ErrorLogModal opened onClose={vi.fn()} slug="s" {...props} />
  </MantineProvider>
);

describe("ErrorLogModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamStatusStore.streams = {
      s: {
        objectId: "iq__s",
        title: "My Stream",
        errors: ["t1 first error", "t2 second error"],
        warnings: ["t1 slow part"]
      }
    };
  });

  it("titles the modal with the stream name and counts each tab", () => {
    renderModal();

    expect(screen.getByText("Error Log for My Stream")).toBeInTheDocument();
    expect(screen.getByRole("tab", {name: "Errors (2)"})).toBeInTheDocument();
    expect(screen.getByRole("tab", {name: "Warnings (1)"})).toBeInTheDocument();
  });

  it("lists errors newest first", () => {
    renderModal();

    expect(screen.getByText(/t2 second error\s+t1 first error/)).toBeInTheDocument();
  });

  it("shows warnings on the Warnings tab", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("tab", {name: "Warnings (1)"}));

    expect(screen.getByText("t1 slow part")).toBeInTheDocument();
  });

  it("shows an empty state when there are no warnings", async () => {
    mockStreamStatusStore.streams.s.warnings = undefined;
    renderModal();

    await userEvent.click(screen.getByRole("tab", {name: "Warnings (0)"}));

    expect(screen.getByText("No warnings")).toBeInTheDocument();
  });

  it("re-checks status and updates the store on Refresh", async () => {
    mockStreamStatusStore.CheckStatus.mockResolvedValue({});
    renderModal();

    await userEvent.click(screen.getByRole("button", {name: "Refresh"}));

    expect(mockStreamStatusStore.CheckStatus).toHaveBeenCalledWith({objectId: "iq__s", slug: "s", update: true});
  });

  it("calls onClose from the Close button", async () => {
    const onClose = vi.fn();
    renderModal({onClose});

    await userEvent.click(screen.getByRole("button", {name: "Close"}));

    expect(onClose).toHaveBeenCalled();
  });
});
