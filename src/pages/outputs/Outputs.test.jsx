import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";

// --- Module mocks (hoisted) -------------------------------------------------

// useNavigate is invoked at render time — provide a stable spy
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
}));

// mantine-datatable does not invoke its per-column render() functions under
// jsdom (it relies on layout measurement that jsdom does not provide). Swap in
// a minimal table mock that calls the render() callbacks so cell content is
// actually in the DOM — exactly the behavior the real DataTable produces in a
// real browser. This is consistent with the project standard of mocking
// external modules with vi.mock.
vi.mock("mantine-datatable", () => ({
  DataTable: ({
    records = [],
    columns = [],
    selectedRecords = [],
    onSelectedRecordsChange
  }) => {
    const selectedSlugs = new Set((selectedRecords || []).map((r) => r.slug));
    return (
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="select-all-rows"
                checked={
                  records.length > 0 && selectedSlugs.size === records.length
                }
                onChange={(e) =>
                  onSelectedRecordsChange?.(e.target.checked ? records : [])
                }
              />
            </th>
            {columns.map((c) => (
              <th key={c.accessor}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.slug} data-record-slug={record.slug}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`select-row-${record.slug}`}
                  checked={selectedSlugs.has(record.slug)}
                  onChange={(e) => {
                    if(e.target.checked) {
                      onSelectedRecordsChange?.([
                        ...(selectedRecords || []),
                        record
                      ]);
                    } else {
                      onSelectedRecordsChange?.(
                        (selectedRecords || []).filter(
                          (r) => r.slug !== record.slug
                        )
                      );
                    }
                  }}
                />
              </td>
              {columns.map((c) => (
                <td key={c.accessor}>
                  {c.render ? c.render(record) : record[c.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}));

// Replace the real MobX stores with plain in-memory mocks the tests can mutate.
// The Outputs component reads outputStore / outputModalStore / rootStore from here.
vi.mock("@/stores/index.ts", () => ({
  outputStore: {
    state: "pending",
    outputList: [],
    tableFilter: "",
    tableTagFilter: [],
    allMappedStreamTags: [],
    sortStatus: {columnAccessor: "name", direction: "asc"},
    LoadOutputs: vi.fn(),
    SetTableFilter: vi.fn(),
    SetTableTagFilter: vi.fn(),
    SetSortStatus: vi.fn()
  },
  outputModalStore: {
    OpenModal: vi.fn()
  },
  rootStore: {
    OpenInFabricBrowser: vi.fn()
  }
}));

// Imports must come AFTER vi.mock so the component picks up mocks
import Outputs from "./Outputs.jsx";
import {outputStore, outputModalStore, rootStore} from "@/stores/index.ts";

// --- Factories (no hardcoded ids) -------------------------------------------

let __slugCounter = 0;
const uniqueSlug = (prefix = "out") =>
  `${prefix}-${Date.now()}-${++__slugCounter}-${Math.floor(Math.random() * 1_000_000)}`;

const makeOutput = (overrides = {}) => {
  const slug = overrides.slug ?? uniqueSlug();
  return {
    slug,
    name: `Output ${slug}`,
    enabled: false,
    reset: true,
    state: {connected_clients: 0},
    url: `srt://stream.example.test/${slug}`,
    srt_pull: {url: `srt://stream.example.test/${slug}`},
    input: undefined,
    streamName: undefined,
    originUrl: undefined,
    ...overrides
  };
};

const renderOutputs = () =>
  render(
    <MantineProvider>
      <Outputs />
    </MantineProvider>
  );

// Mantine 8 sets role="switch" on the input — query by that role so we don't
// collide with the row-selection checkboxes added by the DataTable mock.
const getEnabledSwitch = (screenObj) => screenObj.getByRole("switch");

// Mantine's Title/Text with lineClamp can split text across multiple nodes,
// so RTL's default exact-text match misses the leaf. This matches against
// full textContent, narrowed to the *innermost* element (so we don't also
// match every ancestor that contains the same text and trip RTL's
// "found multiple" guard).
const byTextContent = (text) => (_content, element) => {
  if(!element || element.textContent !== text) { return false; }
  return !Array.from(element.children).some(
    (child) => child.textContent === text
  );
};

// --- Shared setup -----------------------------------------------------------

// Shared clipboard spy — installed via vi.spyOn so it IS the live
// navigator.clipboard.writeText (jsdom 27 ignores plain defineProperty here).
let clipboardWriteText;

beforeEach(() => {
  // Arrange: restore any spies from prior tests, reset call records, reseed
  // the store baseline so state doesn't leak between tests.
  vi.restoreAllMocks();
  vi.clearAllMocks();

  outputStore.state = "pending";
  outputStore.outputList = [];
  outputStore.tableFilter = "";
  outputStore.tableTagFilter = [];
  outputStore.allMappedStreamTags = [];
  outputStore.sortStatus = {columnAccessor: "name", direction: "asc"};
  outputStore.LoadOutputs.mockResolvedValue(undefined);

  // Ensure navigator.clipboard exists (some jsdom versions omit it), then spy
  // on writeText so the component's call to navigator.clipboard.writeText
  // routes through this spy.
  if(!navigator.clipboard) {
    Object.defineProperty(navigator, "clipboard", {
      value: {writeText: async () => undefined},
      configurable: true,
      writable: true
    });
  }
  clipboardWriteText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("Outputs — initial load", () => {
  it("should call outputStore.LoadOutputs on mount when state is not loaded", async () => {
    outputStore.state = "pending";
    renderOutputs();

    await waitFor(() => {
      expect(outputStore.LoadOutputs).toHaveBeenCalledTimes(1);
    });
  });

  it("should NOT call LoadOutputs on mount when outputs are already loaded", () => {
    // Arrange
    outputStore.state = "loaded";

    // Act
    renderOutputs();

    // Assert
    expect(outputStore.LoadOutputs).not.toHaveBeenCalled();
  });

  it("should render the page title when mounted", async () => {
    renderOutputs();

    const title = await screen.findByText("Outputs");
    expect(title).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state — LoadOutputs catches internally, page must remain usable
// ---------------------------------------------------------------------------

describe("Outputs — error state", () => {
  it("should still render the page when LoadOutputs reports an error", async () => {
    // Arrange — the real OutputStore.LoadOutputs catches internally and sets
    // state="error"; model that here so we exercise the error branch without
    // triggering an unhandled rejection from the component's useEffect.
    outputStore.LoadOutputs.mockImplementationOnce(async () => {
      outputStore.state = "error";
    });

    // Act
    renderOutputs();

    // Assert — title resolves after the async load attempt settles
    expect(
      await screen.findByRole("heading", {name: /outputs/i, level: 1})
    ).toBeInTheDocument();
    expect(outputStore.LoadOutputs).toHaveBeenCalledTimes(1);
    expect(outputStore.state).toBe("error");
  });

  it("should render an empty table without crashing when outputList is empty", () => {
    // Arrange
    outputStore.state = "loaded";
    outputStore.outputList = [];

    // Act
    renderOutputs();

    // Assert
    expect(
      screen.getByRole("heading", {name: /outputs/i, level: 1})
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Success state — rows render
// ---------------------------------------------------------------------------

describe("Outputs — success state", () => {
  it("should render a row for each output in the success state", () => {
    // Arrange
    outputStore.state = "loaded";
    const recordA = makeOutput();
    const recordB = makeOutput();
    outputStore.outputList = [recordA, recordB];

    // Act
    renderOutputs();

    // Assert
    expect(screen.getByText(byTextContent(recordA.name))).toBeInTheDocument();
    expect(screen.getByText(byTextContent(recordB.name))).toBeInTheDocument();
  });

  it("should render a 'Map to a Stream' link for unmapped outputs", () => {
    // Arrange
    outputStore.state = "loaded";
    outputStore.outputList = [makeOutput({input: undefined})];

    // Act
    renderOutputs();

    // Assert — link appears in the stream cell when no stream is mapped
    expect(screen.getAllByText(/map to a stream/i).length).toBeGreaterThan(0);
  });

  it("should render the SRT URL for a row", () => {
    // Arrange
    outputStore.state = "loaded";
    const record = makeOutput();
    outputStore.outputList = [record];

    // Act
    renderOutputs();

    // Assert — the URL text node is the unique slug-bearing element in the URL cell
    expect(
      screen.getByText(byTextContent(record.url))
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe("Outputs — interactions", () => {
  it("should open the create modal when the Create button is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    renderOutputs();

    // Act
    await user.click(screen.getByRole("button", {name: /^create$/i}));

    // Assert
    expect(outputModalStore.OpenModal).toHaveBeenCalledWith("create");
  });

  it("should forward search input changes to outputStore.SetTableFilter", async () => {
    // Arrange
    const user = userEvent.setup();
    renderOutputs();
    const search = screen.getByPlaceholderText(/search by name/i);
    const typedChar = "x";

    // Act
    await user.type(search, typedChar);

    // Assert
    expect(outputStore.SetTableFilter).toHaveBeenCalledWith(typedChar);
  });

  it("should navigate to the output details page when a row name is clicked", async () => {
    // Arrange
    outputStore.state = "loaded";
    const record = makeOutput();
    outputStore.outputList = [record];
    const user = userEvent.setup();
    renderOutputs();

    // Act
    await user.click(screen.getByText(byTextContent(record.name)));

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith(`/outputs/${record.slug}`);
  });

  it("should open the map modal for the row when 'Map to a Stream' is clicked", async () => {
    // Arrange — the per-row cell shows "Map to a Stream" (capital S);
    // the batch action button shows "Map to a stream" (lowercase). Use the
    // exact-cased label so we click the row link, not the disabled batch button.
    outputStore.state = "loaded";
    const record = makeOutput({input: undefined});
    outputStore.outputList = [record];
    const user = userEvent.setup();
    renderOutputs();

    // Act
    await user.click(screen.getByText("Map to a Stream"));

    // Assert
    expect(outputModalStore.OpenModal).toHaveBeenCalledWith("map", [record.slug]);
  });

  it("should open the delete modal for the row when the trash action icon is clicked", async () => {
    // Arrange
    outputStore.state = "loaded";
    const record = makeOutput();
    outputStore.outputList = [record];
    const user = userEvent.setup();
    renderOutputs();

    // Act — the row's trash ActionIcon carries title="Delete Output"
    await user.click(screen.getByTitle("Delete Output"));

    // Assert
    expect(outputModalStore.OpenModal).toHaveBeenCalledWith("delete", [record.slug]);
  });

  it("should open the enable modal when toggling a disabled output's switch", () => {
    // Arrange — Mantine's Switch input is visually hidden behind a label,
    // which trips user-event's pointer-events visibility check in jsdom.
    // fireEvent.click bypasses the check and is enough to verify the
    // onChange handler wiring.
    outputStore.state = "loaded";
    const record = makeOutput({enabled: false});
    outputStore.outputList = [record];
    // eslint-disable-next-line no-unused-vars
    const user = userEvent.setup();
    renderOutputs();

    // Act
    fireEvent.click(getEnabledSwitch(screen));

    // Assert
    expect(outputModalStore.OpenModal).toHaveBeenCalledWith("enable", [record.slug]);
  });

  it("should open the disable modal when toggling an enabled output's switch", () => {
    // Arrange
    outputStore.state = "loaded";
    const record = makeOutput({enabled: true});
    outputStore.outputList = [record];
    // eslint-disable-next-line no-unused-vars
    const user = userEvent.setup();
    renderOutputs();

    // Act
    fireEvent.click(getEnabledSwitch(screen));

    // Assert
    expect(outputModalStore.OpenModal).toHaveBeenCalledWith("disable", [record.slug]);
  });

  it("should copy the SRT URL to the clipboard when the copy icon is clicked", () => {
    // Arrange
    outputStore.state = "loaded";
    const record = makeOutput();
    outputStore.outputList = [record];
    const url = record.url;
    // eslint-disable-next-line no-unused-vars
    const user = userEvent.setup();
    renderOutputs();

    // Act — walk from the URL text node up to the row cell, then locate the
    // single ActionIcon button (the copy icon) inside that cell. fireEvent
    // bypasses jsdom pointer-events visibility checks that block ActionIcon.
    const urlNode = screen.getByText(byTextContent(url));
    const copyBtn = urlNode.closest("td").querySelector("button");
    fireEvent.click(copyBtn);

    // Assert — use the captured spy so we're not racing jsdom's clipboard
    expect(clipboardWriteText).toHaveBeenCalledWith(url);
  });

  it("should open the OpenInFabricBrowser viewer when the external-link icon is clicked for a mapped row", async () => {
    // Arrange
    outputStore.state = "loaded";
    const streamObjectId = uniqueSlug("iq");
    const record = makeOutput({
      streamId: streamObjectId,
      streamName: "Mapped Stream",
      streamStatus: "running",
      originUrl: "https://example.test/origin"
    });
    outputStore.outputList = [record];
    const user = userEvent.setup();
    renderOutputs();

    // Act — the external link icon lives in the stream cell of a mapped row
    const streamNode = screen.getByText(byTextContent("Mapped Stream"));
    const externalLinkBtn = streamNode
      .closest("div")
      .querySelector("button");
    await user.click(externalLinkBtn);

    // Assert
    expect(rootStore.OpenInFabricBrowser).toHaveBeenCalledWith({
      objectId: streamObjectId
    });
  });

  it("should let the user select all rows from the batch actions header", async () => {
    // Arrange
    outputStore.state = "loaded";
    outputStore.outputList = [makeOutput(), makeOutput()];
    const user = userEvent.setup();
    renderOutputs();

    // Act
    await user.click(screen.getByText("Select All"));

    // Assert — header reflects the new selection after re-render
    expect(await screen.findByText(/2 selected/i)).toBeInTheDocument();
  });

  it("should open the batch delete modal for every selected row", async () => {
    // Arrange
    outputStore.state = "loaded";
    const recordA = makeOutput();
    const recordB = makeOutput();
    outputStore.outputList = [recordA, recordB];
    const user = userEvent.setup();
    renderOutputs();

    // Act — select all, then trigger the batch Delete action
    await user.click(screen.getByText("Select All"));
    const batchDeleteBtn = await screen.findByRole("button", {name: /^delete$/i});
    await user.click(batchDeleteBtn);

    // Assert
    expect(outputModalStore.OpenModal).toHaveBeenCalledWith(
      "delete",
      expect.arrayContaining([recordA.slug, recordB.slug])
    );
    const [, slugs] = outputModalStore.OpenModal.mock.calls.at(-1);
    expect(slugs).toHaveLength(2);
  });
});
