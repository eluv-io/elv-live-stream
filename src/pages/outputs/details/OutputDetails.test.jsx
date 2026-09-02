import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";
import {useForm} from "@mantine/form";

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
import {SummaryPanel, GeneralConfigPanel} from "./OutputDetails.jsx";
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

// GeneralConfigPanel needs a live form - mount it through a harness that owns one.
const ConfigHarness = ({output, initialValues}) => {
  const form = useForm({
    mode: "controlled",
    initialValues: {
      name: "", type: "srt_pull", nodeType: "public", node: "", geo: "", url: "",
      encryption: false, stripRtp: false, passphrase: "",
      failoverStream: "", failoverStreamName: "", failoverAfter: "5s", failoverReconnect: "on",
      ...initialValues
    }
  });
  return <GeneralConfigPanel form={form} output={output} />;
};

const renderConfig = (props) =>
  render(
    <MantineProvider>
      <ConfigHarness {...props} />
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

// ---------------------------------------------------------------------------
// Editable section (General Config)
// ---------------------------------------------------------------------------

describe("GeneralConfigPanel - Input Failover section", () => {
  it("should disable the section with a note when no primary stream is mapped", () => {
    renderConfig({output: {input: {}}});

    expect(screen.getByText("Input Failover")).toBeInTheDocument();
    expect(screen.getByText(/map a primary stream first/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /add failover stream/i})).not.toBeInTheDocument();
  });

  it("should show the Add Failover Stream button when a primary is mapped and no failover is set", () => {
    renderConfig({output: makeOutput()});

    expect(screen.getByRole("button", {name: /add failover stream/i})).toBeInTheDocument();
    expect(screen.queryByText(/map a primary stream first/i)).not.toBeInTheDocument();
  });

  it("should disable Timeout and Reconnect until a failover stream is chosen", () => {
    renderConfig({output: makeOutput()});

    expect(screen.getByLabelText("Failover Timeout", {selector: "input"})).toBeDisabled();
    expect(screen.getByLabelText("Reconnect", {selector: "input"})).toBeDisabled();
  });

  it("should render the chosen stream as a row and load the stream set", () => {
    streamStore.allStreams = {
      s1: {objectId: "iq__failover", title: "Backup Stream", originUrl: "udp://host:1234", source: ["ts"], packaging: ["ts"]}
    };
    renderConfig({
      output: makeOutput(),
      initialValues: {failoverStream: "iq__failover", failoverStreamName: "Backup Stream"}
    });

    expect(screen.getByText("Backup Stream")).toBeInTheDocument();
    expect(screen.getByText("iq__failover")).toBeInTheDocument();
    expect(screen.getByText("udp://host:1234")).toBeInTheDocument();
    expect(streamStore.LoadAllStreams).toHaveBeenCalled();
  });

  it("should enable Timeout and Reconnect and show Change once a stream is set", () => {
    renderConfig({
      output: makeOutput(),
      initialValues: {failoverStream: "iq__failover", failoverStreamName: "Backup Stream"}
    });

    expect(screen.getByRole("button", {name: /change failover stream/i})).toBeInTheDocument();
    expect(screen.getByLabelText("Failover Timeout", {selector: "input"})).not.toBeDisabled();
    expect(screen.getByLabelText("Reconnect", {selector: "input"})).not.toBeDisabled();
  });

  it("should clear the failover stream when the remove control is clicked", async () => {
    const user = userEvent.setup();
    renderConfig({
      output: makeOutput(),
      initialValues: {failoverStream: "iq__failover", failoverStreamName: "Backup Stream"}
    });

    await user.click(screen.getByRole("button", {name: /remove failover stream/i}));

    expect(screen.getByRole("button", {name: /add failover stream/i})).toBeInTheDocument();
  });

  it("should open the picker modal from the Add Failover Stream button", async () => {
    const user = userEvent.setup();
    renderConfig({output: makeOutput()});

    await user.click(screen.getByRole("button", {name: /add failover stream/i}));

    expect(await screen.findByText("Select Failover Stream")).toBeInTheDocument();
  });
});
