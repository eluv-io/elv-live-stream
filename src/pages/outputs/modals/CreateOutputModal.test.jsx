import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MantineProvider} from "@mantine/core";

vi.mock("@/stores/index.ts", () => ({
  dataStore: {
    loadedDedicatedNodes: true,
    dedicatedNodesList: [],
    LoadDedicatedNodes: vi.fn()
  },
  outputStore: {CreateOutput: vi.fn(), outputList: []}
}));

import CreateOutputModal from "./CreateOutputModal.jsx";

const renderModal = () =>
  render(
    <MantineProvider>
      <CreateOutputModal show onCloseModal={vi.fn()} />
    </MantineProvider>
  );

describe("CreateOutputModal - Input Failover", () => {
  it("should show the failover section as a create-time-unavailable note", () => {
    renderModal();

    expect(screen.getByText("Input Failover")).toBeInTheDocument();
    expect(
      screen.getByText(/available after the output is created and a primary stream is mapped/i)
    ).toBeInTheDocument();
  });

  it("should not render a failover stream picker in the create modal", () => {
    renderModal();

    expect(screen.queryByRole("button", {name: /add failover stream/i})).not.toBeInTheDocument();
  });
});
