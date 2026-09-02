import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";

// StreamsTable is a virtualized custom table that needs layout measurement jsdom
// lacks - stub it with a button per record that drives onRowClick.
vi.mock("@/pages/streams/table/StreamsTable.jsx", () => ({
  default: ({records = [], onRowClick, isRecordSelectable}) => (
    <div>
      {records.map(r => (
        <button
          key={r.objectId}
          disabled={isRecordSelectable && !isRecordSelectable(r)}
          onClick={() => onRowClick({record: r})}
        >
          row-{r.title}
        </button>
      ))}
    </div>
  )
}));

const {LoadAllStreams, state} = vi.hoisted(() => ({
  LoadAllStreams: vi.fn(),
  state: {streams: {}}
}));

vi.mock("@/stores/index.ts", () => ({
  streamStore: {
    get allStreams() { return state.streams; },
    loadingAllStreams: false,
    LoadAllStreams
  }
}));

import SelectFailoverStreamModal from "./SelectFailoverStreamModal.jsx";

const eligible = (objectId, title) => ({objectId, title, inputCfg: {}, packaging: ["ts"]});
const ineligible = (objectId, title) => ({objectId, title, inputCfg: null, packaging: ["rtp"]});

const renderModal = (props = {}) =>
  render(
    <MantineProvider>
      <SelectFailoverStreamModal
        show
        onCloseModal={vi.fn()}
        onSelect={vi.fn()}
        {...props}
      />
    </MantineProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  state.streams = {};
});

describe("SelectFailoverStreamModal", () => {
  it("should load all streams when opened", () => {
    renderModal();
    expect(LoadAllStreams).toHaveBeenCalledTimes(1);
  });

  it("should disable rows that are not TS with an input config", () => {
    state.streams = {a: eligible("iq__a", "Alpha"), b: ineligible("iq__b", "Bravo")};
    renderModal();

    expect(screen.getByRole("button", {name: "row-Alpha"})).not.toBeDisabled();
    expect(screen.getByRole("button", {name: "row-Bravo"})).toBeDisabled();
  });

  it("should return {objectId, title} to onSelect and close on Select", async () => {
    state.streams = {a: eligible("iq__a", "Alpha")};
    const onSelect = vi.fn();
    const onCloseModal = vi.fn();
    const user = userEvent.setup();
    renderModal({onSelect, onCloseModal});

    await user.click(screen.getByRole("button", {name: "row-Alpha"}));
    await user.click(screen.getByRole("button", {name: /^select$/i}));

    expect(onSelect).toHaveBeenCalledWith({objectId: "iq__a", title: "Alpha"});
    expect(onCloseModal).toHaveBeenCalled();
  });

  it("should keep the Select button disabled until a row is picked", () => {
    state.streams = {a: eligible("iq__a", "Alpha")};
    renderModal();

    expect(screen.getByRole("button", {name: /^select$/i})).toBeDisabled();
  });
});
