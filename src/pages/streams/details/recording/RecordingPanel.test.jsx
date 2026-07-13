import {render, screen, act} from "@testing-library/react";
import {vi, describe, it, expect, beforeEach} from "vitest";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {MantineProvider} from "@mantine/core";
import {STATUS_MAP} from "@/utils/constants.ts";

const {
  mockUpdateRecordingConfig,
  mockLoadRecordingConfigData,
  mockLoadOutputStreamInfo,
  mockRegister,
  mockUnregister,
  mockSetDirty
} = vi.hoisted(() => ({
  mockUpdateRecordingConfig: vi.fn(),
  mockLoadRecordingConfigData: vi.fn(),
  mockLoadOutputStreamInfo: vi.fn(),
  mockRegister: vi.fn(),
  mockUnregister: vi.fn(),
  mockSetDirty: vi.fn(),
}));

vi.mock("@/stores/index.ts", () => ({
  streamEditStore: {UpdateRecordingConfig: mockUpdateRecordingConfig},
  streamStore: {
    streams: {
      "test-slug": {originUrl: "udp://host.example.com:1234", protocol: "udp"}
    },
    LoadRecordingConfigData: mockLoadRecordingConfigData
  },
  outputStore: {LoadOutputStreamInfo: mockLoadOutputStreamInfo},
  // RecordingPanel registers its Save/Discard callbacks with streamSaveStore on
  // mount and no longer renders its own Save button — the page-level toolbar
  // now drives saves via the callback captured through Register.
  streamSaveStore: {
    Register: mockRegister,
    Unregister: mockUnregister,
    SetDirty: mockSetDirty
  }
}));

// AudioTracksTable renders mantine-datatable with a grouped-column layout the
// generic DataTable mock doesn't model — stub it out entirely since this is a
// smoke test of RecordingPanel's own Save wiring, not the audio table.
vi.mock("@/pages/streams/details/recording/audio-tracks-table/AudioTracksTable.jsx", () => ({
  default: () => <div>Audio Tracks Table</div>
}));

vi.mock("@/components/section-title/SectionTitle.jsx", () => ({
  default: ({children}) => <div>{children}</div>
}));

import RecordingPanel from "@/pages/streams/details/recording/RecordingPanel.jsx";

const baseConfigData = {
  audioStreams: [],
  audioData: {},
  retention: 3600,
  persistent: false,
  connectionTimeout: 600,
  reconnectionTimeout: 600,
  copyMpegTs: false,
  inputCfg: {input_packaging: "raw_ts", copy_packaging: "raw_ts", copy_mode: null},
  multiPath: {enabled: false}
};

const renderRecordingPanel = (props = {}) => {
  render(
    <MantineProvider defaultColorScheme="light">
      <MemoryRouter initialEntries={["/streams/iq__123"]}>
        <Routes>
          <Route
            path="/streams/:id"
            element={<RecordingPanel slug="test-slug" status={STATUS_MAP.INACTIVE} {...props} />}
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  );
};

describe("RecordingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadRecordingConfigData.mockResolvedValue({...baseConfigData});
    mockUpdateRecordingConfig.mockResolvedValue(undefined);
    mockLoadOutputStreamInfo.mockResolvedValue(undefined);
  });

  it("should render the Retention section once config data has loaded", async () => {
    renderRecordingPanel();

    expect(await screen.findByText("Retention")).toBeInTheDocument();
  });

  it("should register a Save/Discard callback with streamSaveStore on mount", async () => {
    renderRecordingPanel();

    await screen.findByText("Retention");

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "recording",
        Save: expect.any(Function),
        Discard: expect.any(Function)
      })
    );
  });

  it("should unregister from streamSaveStore on unmount", async () => {
    const {unmount} = render(
      <MantineProvider defaultColorScheme="light">
        <MemoryRouter initialEntries={["/streams/iq__123"]}>
          <Routes>
            <Route
              path="/streams/:id"
              element={<RecordingPanel slug="test-slug" status={STATUS_MAP.INACTIVE} />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    );

    await screen.findByText("Retention");
    unmount();

    expect(mockUnregister).toHaveBeenCalledWith("recording");
  });

  it("should call UpdateRecordingConfig with the loaded config when Save is invoked", async () => {
    renderRecordingPanel();
    await screen.findByText("Retention");

    const {Save} = mockRegister.mock.calls[0][0];
    await act(async () => {
      await Save();
    });

    expect(mockUpdateRecordingConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "test-slug",
        audioFormData: {},
        configFormData: expect.objectContaining({
          retention: 3600,
          persistent: false,
          connectionTimeout: 600,
          reconnectionTimeout: 600
        }),
        tsFormData: expect.objectContaining({
          copyMpegTs: false,
          inputPackaging: "raw_ts",
          fabricPackagingFMP4: true,
          fabricPackagingMpegTs: false,
          copyPackaging: "raw_ts"
        }),
        edit: true,
        multiPathEnabled: false
      })
    );
  });

  it("should mark persistent=true and skip a numeric retention when retention is 'indefinite'", async () => {
    mockLoadRecordingConfigData.mockResolvedValue({...baseConfigData, retention: null, persistent: true});
    renderRecordingPanel();
    await screen.findByText("Retention");

    const {Save} = mockRegister.mock.calls[0][0];
    await act(async () => {
      await Save();
    });

    expect(mockUpdateRecordingConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        configFormData: expect.objectContaining({retention: null, persistent: true})
      })
    );
  });

  it("should refresh output stream info after a successful save", async () => {
    renderRecordingPanel();
    await screen.findByText("Retention");

    const {Save} = mockRegister.mock.calls[0][0];
    await act(async () => {
      await Save();
    });

    expect(mockLoadOutputStreamInfo).toHaveBeenCalledWith(
      expect.objectContaining({slug: "test-slug"})
    );
  });
});
