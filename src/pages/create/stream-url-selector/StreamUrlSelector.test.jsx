import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, it, expect, vi, beforeEach} from "vitest";
import {MantineProvider} from "@mantine/core";

// Mantine 8's Popover/Transition never fires transitionend in jsdom, so the
// Select dropdown stays display:none. We mock Select with a plain stateful
// component: click input → options appear immediately, click option → onChange.
// TextInput is kept from actual Mantine so the protocol=custom branch still
// renders a real <input type="text"> without aria-haspopup.
vi.mock("@mantine/core", async () => {
  const actual = await vi.importActual("@mantine/core");
  const {useState} = await import("react");

  const MockSelect = ({label, value, data = [], onChange, disabled, error, withAsterisk}) => {
    const [open, setOpen] = useState(false);
    const opts = (data || []).map(opt => typeof opt === "string" ? {label: opt, value: opt} : opt);
    return (
      <div>
        {/* aria-label on the input itself avoids duplicate-id label issues across tab panels */}
        <input
          type="text"
          aria-label={withAsterisk ? `${label} *` : label}
          aria-haspopup="listbox"
          value={value ?? ""}
          disabled={disabled}
          readOnly
          onClick={() => !disabled && setOpen(o => !o)}
          onChange={() => {}}
        />
        {open && (
          <ul role="listbox">
            {opts.map(opt => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange?.(opt.value); setOpen(false); }}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}
        {error && <div>{error}</div>}
      </div>
    );
  };

  return {...actual, Select: MockSelect};
});

const {mockDataStore} = vi.hoisted(() => ({
  mockDataStore: {
    liveStreamUrls: {},
    dedicatedNodes: null,
    dedicatedNodesList: [],
    loadedDedicatedNodes: true,
    loadedUrls: true,
    DedicatedNodeUrls: vi.fn().mockReturnValue([]),
  }
}));

vi.mock("@/stores/index.js", () => ({dataStore: mockDataStore}));

import StreamUrlSelector from "./StreamUrlSelector";

const defaultProps = {
  activeTab: "public",
  onActiveTabChange: vi.fn(),
  onProtocolChange: vi.fn(),
  onUrlChange: vi.fn(),
  onCustomUrlChange: vi.fn(),
  onNodeChange: vi.fn(),
  urlError: undefined,
  customUrlError: undefined,
};

const renderSelector = (props = {}) => {
  const user = userEvent.setup();
  const result = render(
    <MantineProvider>
      <StreamUrlSelector {...defaultProps} {...props} />
    </MantineProvider>
  );
  return {...result, user};
};

// Helpers that find the Protocol and URL inputs in the active panel.
// Mantine hides inactive tab panels with CSS (display:none), so RTL's
// getByRole skips them and returns only the visible panel's inputs.
const getProtocolInput = () => screen.getByRole("textbox", {name: /Protocol/i});
const getUrlInput = () => screen.getByRole("textbox", {name: /^URL/i});

const switchToCustomProtocol = async (user) => {
  await user.click(getProtocolInput());
  await user.click(await screen.findByRole("option", {name: /Custom/i}));
};

describe("StreamUrlSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDataStore.dedicatedNodes = null;
    mockDataStore.liveStreamUrls = {};
    mockDataStore.dedicatedNodesList = [];
    mockDataStore.DedicatedNodeUrls.mockReturnValue([]);
  });

  describe("tab visibility", () => {
    it("always renders the Public tab", () => {
      renderSelector();
      expect(screen.getByRole("tab", {name: /public/i})).toBeInTheDocument();
    });

    it("does not render the Dedicated tab when dedicatedNodes is null", () => {
      renderSelector();
      expect(screen.queryByRole("tab", {name: /dedicated/i})).not.toBeInTheDocument();
    });

    it("renders the Dedicated tab when dedicatedNodes is set", () => {
      mockDataStore.dedicatedNodes = {"node-1": {urls: {}}};
      renderSelector();
      expect(screen.getByRole("tab", {name: /dedicated/i})).toBeInTheDocument();
    });
  });

  describe("protocol select", () => {
    it("renders a Protocol input", () => {
      renderSelector();
      expect(getProtocolInput()).toBeInTheDocument();
    });

    it("Protocol input is a Select (has aria-haspopup=listbox)", () => {
      renderSelector();
      expect(getProtocolInput()).toHaveAttribute("aria-haspopup", "listbox");
    });

    it("calls onProtocolChange when protocol is changed", async () => {
      const onProtocolChange = vi.fn();
      const {user} = renderSelector({onProtocolChange});
      await user.click(getProtocolInput());
      await user.click(await screen.findByRole("option", {name: /RTMP/i}));
      expect(onProtocolChange).toHaveBeenCalledWith("rtmp");
    });

    it("resets URL to empty string when protocol changes", async () => {
      const onUrlChange = vi.fn();
      const {user} = renderSelector({onUrlChange});
      await user.click(getProtocolInput());
      await user.click(await screen.findByRole("option", {name: /RTMP/i}));
      expect(onUrlChange).toHaveBeenCalledWith("");
    });
  });

  describe("URL field — Select vs TextInput", () => {
    it("URL input is a Select (has aria-haspopup) when protocol is not custom", () => {
      renderSelector();
      expect(getUrlInput()).toHaveAttribute("aria-haspopup", "listbox");
    });

    it("URL input becomes a plain TextInput (no aria-haspopup) when protocol is custom", async () => {
      const {user} = renderSelector();
      await switchToCustomProtocol(user);
      expect(getUrlInput()).not.toHaveAttribute("aria-haspopup");
    });

    it("calls onCustomUrlChange when typing in the custom URL TextInput", async () => {
      const onCustomUrlChange = vi.fn();
      const {user} = renderSelector({onCustomUrlChange});
      await switchToCustomProtocol(user);
      await user.type(getUrlInput(), "srt://custom-host:1234");
      expect(onCustomUrlChange).toHaveBeenCalled();
      expect(onCustomUrlChange.mock.calls.at(-1)[0]).toContain("srt://custom-host:1234");
    });

    it("calls onUrlChange when a URL option is selected", async () => {
      mockDataStore.liveStreamUrls = {
        "udp://239.0.0.1:5000": {protocol: "mpegts", active: false}
      };
      const onUrlChange = vi.fn();
      const {user} = renderSelector({onUrlChange});
      await user.click(getUrlInput());
      await user.click(await screen.findByRole("option", {name: /udp:\/\/239\.0\.0\.1:5000/i}));
      expect(onUrlChange).toHaveBeenCalledWith("udp://239.0.0.1:5000");
    });
  });

  describe("URL options from liveStreamUrls", () => {
    it("shows matching non-active URLs and excludes active/wrong-protocol ones", async () => {
      mockDataStore.liveStreamUrls = {
        "udp://239.0.0.1:5000": {protocol: "mpegts", active: false},
        "udp://239.0.0.2:5000": {protocol: "mpegts", active: true},
        "rtp://host:5000": {protocol: "rtp", active: false},
      };
      const {user} = renderSelector();
      await user.click(getUrlInput());
      const options = await screen.findAllByRole("option");
      const labels = options.map(o => o.textContent);
      expect(labels).toContain("udp://239.0.0.1:5000");
      expect(labels).not.toContain("udp://239.0.0.2:5000");
      expect(labels).not.toContain("rtp://host:5000");
    });
  });

  describe("error display", () => {
    it("shows urlError near the URL input", () => {
      renderSelector({urlError: "URL is required"});
      // Both panels render the error; scope to the active tabpanel (getByRole
      // filters display:none, so only the visible panel is returned).
      const activePanel = screen.getByRole("tabpanel");
      expect(within(activePanel).getByText("URL is required")).toBeInTheDocument();
    });

    it("shows customUrlError on the custom URL TextInput", async () => {
      const {user} = renderSelector({customUrlError: "Invalid URL format"});
      await switchToCustomProtocol(user);
      expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
    });
  });

  describe("tab switching", () => {
    beforeEach(() => {
      mockDataStore.dedicatedNodes = {"node-1": {urls: {}}};
    });

    it("calls onActiveTabChange when switching to dedicated", async () => {
      const onActiveTabChange = vi.fn();
      const {user} = renderSelector({onActiveTabChange, activeTab: "public"});
      await user.click(screen.getByRole("tab", {name: /dedicated/i}));
      expect(onActiveTabChange).toHaveBeenCalledWith("dedicated");
    });

    it("calls onProtocolChange with the dedicated tab's current protocol when switching", async () => {
      const onProtocolChange = vi.fn();
      const {user} = renderSelector({onProtocolChange, activeTab: "public"});
      await user.click(screen.getByRole("tab", {name: /dedicated/i}));
      expect(onProtocolChange).toHaveBeenCalledWith("mpegts");
    });

    it("calls onUrlChange when switching tabs", async () => {
      const onUrlChange = vi.fn();
      const {user} = renderSelector({onUrlChange, activeTab: "public"});
      await user.click(screen.getByRole("tab", {name: /dedicated/i}));
      expect(onUrlChange).toHaveBeenCalled();
    });
  });

  describe("dedicated tab", () => {
    beforeEach(() => {
      mockDataStore.dedicatedNodes = {"node-1": {urls: {}}};
    });

    it("shows a Node selector", () => {
      renderSelector({activeTab: "dedicated"});
      expect(screen.getByRole("textbox", {name: /Node/i})).toBeInTheDocument();
    });

    it("URL input is disabled when no node is selected", () => {
      renderSelector({activeTab: "dedicated"});
      expect(getUrlInput()).toBeDisabled();
    });

    it("calls onNodeChange when a node is selected", async () => {
      mockDataStore.dedicatedNodesList = [{label: "Node 1", value: "node-1"}];
      const onNodeChange = vi.fn();
      const {user} = renderSelector({activeTab: "dedicated", onNodeChange});
      await user.click(screen.getByRole("textbox", {name: /Node/i}));
      await user.click(await screen.findByRole("option", {name: /Node 1/i}));
      expect(onNodeChange).toHaveBeenCalledWith("node-1");
    });

    it("calls onUrlChange with empty string when a node is selected", async () => {
      mockDataStore.dedicatedNodesList = [{label: "Node 1", value: "node-1"}];
      const onUrlChange = vi.fn();
      const {user} = renderSelector({activeTab: "dedicated", onUrlChange});
      await user.click(screen.getByRole("textbox", {name: /Node/i}));
      await user.click(await screen.findByRole("option", {name: /Node 1/i}));
      expect(onUrlChange).toHaveBeenCalledWith("");
    });

    it("URL input becomes enabled after a node is selected", async () => {
      mockDataStore.dedicatedNodesList = [{label: "Node 1", value: "node-1"}];
      mockDataStore.DedicatedNodeUrls.mockReturnValue(["udp://node1:5000"]);
      const {user} = renderSelector({activeTab: "dedicated"});
      await user.click(screen.getByRole("textbox", {name: /Node/i}));
      await user.click(await screen.findByRole("option", {name: /Node 1/i}));
      await waitFor(() => expect(getUrlInput()).not.toBeDisabled());
    });
  });
});