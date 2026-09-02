import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";
import {useForm} from "@mantine/form";

// --- Module mocks (hoisted) -------------------------------------------------

// The picker modal renders the virtualized StreamsTable, which jsdom can't
// measure - stub it (the failover row is a plain local component).
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
import GeneralConfig from "./GeneralConfig.jsx";
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

// GeneralConfig needs a live form - mount it through a harness that owns one.
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
  return <GeneralConfig form={form} output={output} />;
};

const renderConfig = (props) =>
  render(
    <MantineProvider>
      <ConfigHarness {...props} />
    </MantineProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  streamStore.allStreams = {};
});

describe("GeneralConfig - Input Failover section", () => {
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
