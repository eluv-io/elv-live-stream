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

describe("CreateOutputModal", () => {
  it("should render the create form with a Create button", () => {
    renderModal();

    expect(screen.getByText("Create New Output")).toBeInTheDocument();
    expect(screen.getByRole("textbox", {name: "Name"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Create"})).toBeInTheDocument();
  });
});
