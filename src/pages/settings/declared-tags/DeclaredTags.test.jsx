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
  },
  streamStore: {
    loadingAllStreams: false,
    LoadAllStreams: vi.fn().mockResolvedValue({}),
    StreamCountWithTag: vi.fn(tag => tag === "news" ? 2 : 0)
  },
  streamEditStore: {
    ReplaceTagOnStreams: vi.fn().mockResolvedValue({total: 2, failed: 0})
  }
}));

import DeclaredTags from "./DeclaredTags.jsx";
import {dataStore, streamEditStore} from "@/stores/index.ts";

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

  it("removes the tag from streams when the delete checkbox is checked", async() => {
    renderComponent();
    await userEvent.click(screen.getAllByRole("button", {hidden: true}).filter(b => b.querySelector("svg.tabler-icon-trash"))[0]);
    await userEvent.click(await screen.findByLabelText("Also remove from 2 streams"));
    await userEvent.click(screen.getByRole("button", {name: "Delete Tag"}));

    await waitFor(() => expect(streamEditStore.ReplaceTagOnStreams).toHaveBeenCalledWith({oldTag: "news", newTag: undefined}));
    await waitFor(() => expect(dataStore.SaveDeclaredTags).toHaveBeenCalledWith(
      expect.objectContaining({tags: ["sports"]})
    ));
  });

  it("keeps the tag declared when some streams fail to update", async() => {
    streamEditStore.ReplaceTagOnStreams.mockResolvedValueOnce({total: 2, failed: 1});
    renderComponent();
    await userEvent.click(screen.getAllByRole("button", {hidden: true}).filter(b => b.querySelector("svg.tabler-icon-trash"))[0]);
    await userEvent.click(await screen.findByLabelText("Also remove from 2 streams"));
    await userEvent.click(screen.getByRole("button", {name: "Delete Tag"}));

    await waitFor(() => expect(streamEditStore.ReplaceTagOnStreams).toHaveBeenCalled());
    expect(dataStore.SaveDeclaredTags).not.toHaveBeenCalled();
  });
});
