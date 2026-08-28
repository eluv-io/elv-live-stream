import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core"; // 1. Import MantineProvider
import Streams from "./Streams";

// --- Module mocks (hoisted) -------------------------------------------------
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockDataStore, mockStreamStore, mockModalStore, mockStreamGroupStore } = vi.hoisted(() => {
  return {
    mockStreamGroupStore: { groups: {}, LoadGroupData: vi.fn() },
    mockDataStore: {
      streamsLoaded: true,
      LoadSiteStreams: vi.fn(),
      LoadStreamUrls: vi.fn().mockResolvedValue([]),
      loadedDedicatedNodes: true,
      LoadDedicatedNodes: vi.fn().mockResolvedValue([]),
      dedicatedNodesList: []
    },
    mockStreamStore: {
      tableFilter: "",
      tableTagFilter: [],
      streams: {
        "stream-1": { objectId: "123", slug: "stream-1", title: "Live Sports News" },
        "stream-2": { objectId: "456", slug: "stream-2", title: "Music Festival Feed" },
      },
      get filteredStreams() { return Object.values(this.streams); },
      get allTags() { return []; },
      SetTableFilter: vi.fn(),
      SetTableTagFilter: vi.fn(),
      SetDateRangeFilter: vi.fn(),
      CheckStatus: vi.fn().mockResolvedValue({}),
    },
    mockModalStore: { SetBatchModal: vi.fn() }
  };
});

// jsdom doesn't lay out real elements, so the scroll container always measures as 0px and
// @tanstack/react-virtual would compute an empty visible range. This mock bypasses windowing
// entirely and just returns every row, so StreamsTable's actual column/selection/sort markup
// renders and is exercised for real.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({count}) => ({
    getVirtualItems: () => Array.from({length: count}, (_, index) => ({index, key: index, start: index * 51, size: 51})),
    getTotalSize: () => count * 51
  })
}));

vi.mock("@/stores", () => ({
  dataStore: mockDataStore,
  streamStore: mockStreamStore,
  modalStore: mockModalStore,
  streamGroupStore: mockStreamGroupStore,
}));
// -------------------------------------------------------------------------------

const renderWithProviders = (ui) => {
  return render(
    <MantineProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </MantineProvider>
  );
};

describe("Streams Dashboard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDataStore.streamsLoaded = true;
    mockStreamStore.tableFilter = "";
  });

  it("should trigger LoadSiteStreams on mount if streams are not loaded", () => {
    mockDataStore.streamsLoaded = false;

    renderWithProviders(<Streams />);

    expect(mockDataStore.LoadSiteStreams).toHaveBeenCalledTimes(1);
  });

  it("should display the records passed from the stream store", async () => {
    renderWithProviders(<Streams />);

    const sportStreamRow = await screen.findByText(/Live Sports News/i);
    const musicStreamRow = await screen.findByText(/Music Festival Feed/i);

    expect(sportStreamRow).toBeInTheDocument();
    expect(musicStreamRow).toBeInTheDocument();
  });

  it("should handle updating the table filter text when typing into search", () => {
    renderWithProviders(<Streams />);

    const searchInput = screen.getByRole("textbox");
    fireEvent.change(searchInput, { target: { value: "Sports" } });

    expect(mockStreamStore.SetTableFilter).toHaveBeenCalledWith("Sports");
  });

  it("should manage button disabled states conditionally based on record selection", async () => {
    mockDataStore.streamsLoaded = true;
    mockStreamStore.streams = {
      "stream-1": { objectId: "123", slug: "stream-1", title: "Live Sports News" },
    };

    renderWithProviders(<Streams />);

    const startButton = screen.getByRole("button", { name: /start/i });
    const duplicateButton = screen.getByRole("button", { name: /duplicate/i });

    expect(startButton).toBeDisabled();
    expect(duplicateButton).toBeDisabled();

    const rowCheckbox = await screen.findByRole("checkbox", {name: /select-row-stream-1/i});

    fireEvent.click(rowCheckbox);

    await waitFor(() => {
      expect(startButton).not.toBeDisabled();
      expect(duplicateButton).not.toBeDisabled();
    });
  });

  it("should trigger navigation to creation layout when clicking Create", () => {
    renderWithProviders(<Streams />);

    const createButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(createButton);

    expect(mockNavigate).toHaveBeenCalledWith("/streams/create");
  });
});
