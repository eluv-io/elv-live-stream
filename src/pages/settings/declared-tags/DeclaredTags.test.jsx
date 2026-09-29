import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";

vi.mock("mantine-datatable", () => ({
  DataTable: ({records = [], columns = []}) => (
    <table>
      <tbody>
        {records.map(record => (
          <tr key={record.name}>
            {columns.map((c, i) => <td key={i}>{c.render(record)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}));

vi.mock("@/stores/index.ts", () => ({
  dataStore: {
    declaredTags: ["news", "sports"],
    loadedDeclaredTags: true,
    LoadDeclaredTags: vi.fn().mockResolvedValue(undefined),
    SaveDeclaredTags: vi.fn().mockResolvedValue(undefined)
  }
}));

import DeclaredTags from "./DeclaredTags.jsx";
import {dataStore} from "@/stores/index.ts";

const renderComponent = () => render(<MantineProvider><DeclaredTags /></MantineProvider>);

describe("DeclaredTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and renders tag names", () => {
    renderComponent();

    expect(dataStore.LoadDeclaredTags).toHaveBeenCalled();
    expect(screen.getByText("news")).toBeInTheDocument();
    expect(screen.getByText("sports")).toBeInTheDocument();
  });

  it("refreshes tags", async() => {
    renderComponent();
    await userEvent.click(screen.getByRole("button", {name: "Refresh"}));

    await waitFor(() => expect(dataStore.LoadDeclaredTags).toHaveBeenCalledTimes(2));
  });

  it("adds a tag", async() => {
    renderComponent();
    await userEvent.click(screen.getByRole("button", {name: "Add Tag"}));
    await userEvent.type(await screen.findByPlaceholderText("Enter tag name"), "movies");
    await userEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(dataStore.SaveDeclaredTags).toHaveBeenCalledWith(
      expect.objectContaining({tags: ["news", "sports", "movies"]})
    ));
  });

  it("blocks duplicate tags", async() => {
    renderComponent();
    await userEvent.click(screen.getByRole("button", {name: "Add Tag"}));
    await userEvent.type(await screen.findByPlaceholderText("Enter tag name"), "news");

    expect(screen.getByText("This tag already exists")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });
});
