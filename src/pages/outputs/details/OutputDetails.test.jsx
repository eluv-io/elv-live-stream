import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen} from "@testing-library/react";
import {MantineProvider} from "@mantine/core";

// --- Module mocks (hoisted) -------------------------------------------------

// The video player pulls in the heaviest deps in the bundle and needs streamStore
// state jsdom can't provide - the failover card is presentational, so stub it out.
vi.mock("@/components/video-container/VideoContainer.jsx", () => ({
  default: () => <div data-testid="video-container" />
}));

// The picker modal renders the virtualized StreamsTable, which jsdom can't
// measure - stub it (the failover row is now a plain local component).
vi.mock("@/pages/streams/table/StreamsTable.jsx", () => ({
  default: () => <div data-testid="streams-table" />
}));

vi.mock("@/stores/index.ts", () => ({
  dataStore: {dedicatedNodesList: [], loadedDedicatedNodes: true, dedicatedNodes: {}},
  outputStore: {},
  outputSaveStore: {},
  outputModalStore: {OpenModal: vi.fn()},
  streamStore: {allStreams: {}, loadingAllStreams: false, LoadAllStreams: vi.fn()}
}));

// Imports must come AFTER vi.mock so the module picks up the mocks
import {SummaryPanel} from "./OutputDetails.jsx";
import {streamStore} from "@/stores/index.ts";

// --- Factories -----------------------------------------------------------

const makeOutput = (overrides = {}) => ({
  name: "Redundant ULHC 001 002",
  enabled: true,
  input: {
    stream: "iq__primary",
    name: "Primary Stream",
    status: "running",
    quality: 0.9,
    ...overrides.input
  },
  ...overrides
});

const withFailover = (failover = {}) => ({
  input: {
    failover: {
      after: "5s",
      disconnect_outputs: true,
      input: {stream: "iq__failover"},
      ...failover
    }
  }
});

const renderPanel = (output) =>
  render(
    <MantineProvider>
      <SummaryPanel output={output} url="srt://egress.example.test/out016" id="out016" />
    </MantineProvider>
  );

// DetailCard renders each row as "<label>:" + value in sibling nodes.
const rowValue = (label) => {
  const labelNode = screen.getByText(`${label}:`);
  return labelNode.nextElementSibling?.textContent ?? "";
};

beforeEach(() => {
  vi.clearAllMocks();
  streamStore.allStreams = {};
});

// ---------------------------------------------------------------------------
// Read-only card
// ---------------------------------------------------------------------------

describe("SummaryPanel - Input Failover card", () => {
  it("should not render the failover card when the output has no failover config", () => {
    renderPanel(makeOutput());

    expect(screen.queryByText("Input Failover")).not.toBeInTheDocument();
    expect(screen.getByText("Input Primary")).toBeInTheDocument();
  });

  it("should not render the failover card when failover has no target stream", () => {
    renderPanel(makeOutput({input: {failover: {after: "5s", input: {}}}}));

    expect(screen.queryByText("Input Failover")).not.toBeInTheDocument();
  });

  it("should render the failover card with the resolved name and stream id", () => {
    renderPanel(
      makeOutput(withFailover({name: "Backup Stream"}))
    );

    expect(screen.getByText("Input Failover")).toBeInTheDocument();
    expect(rowValue("Failover Stream")).toBe("Backup Stream");
    expect(rowValue("Stream ID")).toBe("iq__failover");
  });

  it("should fall back to the object id when the failover stream name is unresolved", () => {
    renderPanel(makeOutput(withFailover({name: undefined})));

    expect(rowValue("Failover Stream")).toBe("iq__failover");
  });

  it("should render failover quality and input stats like the primary card", () => {
    renderPanel(
      makeOutput({
        input: {
          stream: "iq__primary",
          failover: {
            after: "5s",
            input: {stream: "iq__failover"},
            quality: 0.9,
            stats: {ts: {packets_received: 1000, packets_dropped: 10}}
          }
        }
      })
    );

    // Both cards carry the shared stat rows - one label per card.
    expect(screen.getByText("Input Failover")).toBeInTheDocument();
    expect(screen.getAllByText("Packets Recv / Drop (%):").length).toBe(2);
    expect(screen.getByText("1,000 / 10 (0.01%)")).toBeInTheDocument();
  });

  it("should reflect the resolved failover stream status in the card header", () => {
    // withFailover drops the primary stream, so the only status indicator on the
    // page is the failover card's - STATUS_TEXT maps "running" -> "Running".
    renderPanel(makeOutput(withFailover({status: "running"})));

    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  // DOCUMENT_POSITION_FOLLOWING (4) => b comes after a in document order.
  const isAfter = (a, b) => Boolean(a.compareDocumentPosition(b) & 4);

  it("should badge the primary card CONNECTED when it is the active_stream", () => {
    renderPanel(
      makeOutput({
        input: {stream: "iq__primary", failover: {after: "5s", input: {stream: "iq__failover"}}},
        state: {failover: {active_stream: "iq__primary"}}
      })
    );

    expect(screen.getAllByText("Connected").length).toBe(1);
    // Primary badge precedes the Input Failover card header.
    expect(isAfter(screen.getByText("Connected"), screen.getByText("Input Failover"))).toBe(true);
  });

  it("should badge the failover card CONNECTED when it is the active_stream", () => {
    renderPanel(
      makeOutput({
        ...withFailover(),
        state: {failover: {active_stream: "iq__failover"}}
      })
    );

    expect(screen.getAllByText("Connected").length).toBe(1);
    // Failover badge follows the Input Failover card header.
    expect(isAfter(screen.getByText("Input Failover"), screen.getByText("Connected"))).toBe(true);
  });

  it("should badge the failover card CONNECTED when state.stream reports a failover trigger", () => {
    renderPanel(
      makeOutput({
        ...withFailover(),
        state: {stream: {status: "error", error: "failover triggered"}}
      })
    );

    expect(screen.getAllByText("Connected").length).toBe(1);
    expect(isAfter(screen.getByText("Input Failover"), screen.getByText("Connected"))).toBe(true);
  });

  it("should not badge either card when there is no failover state", () => {
    renderPanel(makeOutput(withFailover()));

    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("should not badge the failover card for an unrelated state.stream error", () => {
    renderPanel(
      makeOutput({
        ...withFailover(),
        state: {stream: {status: "error", error: "input disconnected"}}
      })
    );

    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("should still render the failover card when the primary stream is unavailable", () => {
    const output = makeOutput({
      input: {
        stream: "iq__primary",
        status: "unavailable",
        failover: {after: "10s", input: {stream: "iq__failover"}, quality: 0.8}
      }
    });
    renderPanel(output);

    expect(screen.getByText(/the mapped stream no longer exists/i)).toBeInTheDocument();
    expect(screen.getByText("Input Failover")).toBeInTheDocument();
  });
});
