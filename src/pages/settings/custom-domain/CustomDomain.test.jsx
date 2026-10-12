import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";

vi.mock("@/stores/index.ts", () => ({
  dataStore: {
    customDomain: "https://old.example.com",
    loadedCustomDomain: true,
    LoadCustomDomain: vi.fn().mockResolvedValue(undefined),
    SaveCustomDomain: vi.fn().mockResolvedValue(undefined)
  }
}));

import CustomDomain from "./CustomDomain.jsx";
import {dataStore} from "@/stores/index.ts";

const renderComponent = () => render(<MantineProvider><CustomDomain /></MantineProvider>);

describe("CustomDomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the domain and disables Save until dirty", async() => {
    renderComponent();

    const input = await screen.findByLabelText("Custom Domain");
    await waitFor(() => expect(input).toHaveValue("https://old.example.com"));
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });

  it("shows a validation error and does not save an invalid URL", async() => {
    renderComponent();

    const input = await screen.findByLabelText("Custom Domain");
    await waitFor(() => expect(input).toHaveValue("https://old.example.com"));
    await userEvent.clear(input);
    await userEvent.type(input, "not a url");
    await userEvent.click(screen.getByRole("button", {name: "Save"}));

    expect(await screen.findByText(/valid URL/)).toBeInTheDocument();
    expect(dataStore.SaveCustomDomain).not.toHaveBeenCalled();
  });

  it("saves a valid URL and disables Save again", async() => {
    renderComponent();

    const input = await screen.findByLabelText("Custom Domain");
    await waitFor(() => expect(input).toHaveValue("https://old.example.com"));
    await userEvent.clear(input);
    await userEvent.type(input, "https://new.example.com");
    await userEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(dataStore.SaveCustomDomain).toHaveBeenCalledWith({customDomain: "https://new.example.com"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).toBeDisabled());
  });
});
