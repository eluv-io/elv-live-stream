import {act, render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {vi, describe, it, expect, beforeEach} from "vitest";
import {MemoryRouter} from "react-router-dom";
import {MantineProvider} from "@mantine/core";

const { TEST_STATE, mockInitLiveStreamObject, mockConfigureStream, mockNavigate, mockNotificationShow } = vi.hoisted(() => {
  return {
    TEST_STATE: { profiles: {} },
    mockInitLiveStreamObject: vi.fn(),
    mockConfigureStream: vi.fn(),
    mockNavigate: vi.fn(),
    mockNotificationShow: vi.fn(),
  };
});

vi.mock("@mantine/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Select: ({ label, value, onChange, placeholder, data, ...props }) => {
      /* eslint-disable no-unused-vars */
      const {
        allowDeselect,
        withAsterisk,
        clearable,
        searchable,
        nothingFoundMessage,
        checkIconPosition,
        defaultValue,
        ...validHtmlProps
      } = props;
      /* eslint-enable no-unused-vars */

      let finalData = data || [];
      if (placeholder === "Select Config Profile") {
        finalData = [{ value: "my-profile", label: "My Profile" }];
      }
      if (placeholder === "Select Library") {
        finalData = [{ value: "ilib123", label: "Test Library" }];
      }

      return (
        <div>
          <label>{label}</label>
          <select
            value={value || ""} // Strictly enforces a controlled component
            onChange={(e) => onChange && onChange(e.target.value)}
            placeholder={placeholder}
            data-testid="mock-select"
            {...validHtmlProps}
          >
            <option value="">{placeholder || "Select..."}</option>
            {finalData.map((item) => {
              const val = typeof item === "string" ? item : item.value;
              const lbl = typeof item === "string" ? item : item.label;
              return <option key={val} value={val}>{lbl}</option>;
            })}
          </select>
        </div>
      );
    },
  };
});

vi.mock("@/stores", () => {
  const profileMockData = {
    "my-profile": {
      name: "My Profile",
      recording_config: { part_ttl: 3600 },
      playout_config: { playout_formats: ["hls-clear", "dash-clear"] }
    }
  };

  return {
    rootStore: {
      errorMessage: null,
      client: {
        permissionLevels: {
          editable: { short: "Editable", description: "Can edit content" },
          owner: { short: "Owner", description: "Full owner access" },
        }
      }
    },
    dataStore: {
      tenantId: "tenant123",
      libraries: { "ilib123": { name: "Test Library" } },
      accessGroups: {},
      liveStreamUrls: {},
      LoadAccessGroups: vi.fn().mockResolvedValue(undefined),
      LoadDedicatedNodes: vi.fn().mockResolvedValue(undefined),
      LoadLibraries: vi.fn().mockResolvedValue(undefined),
      LoadStreamUrls: vi.fn().mockResolvedValue(undefined),
      LoadStreamProbeData: vi.fn().mockResolvedValue({ audioStreams: [], audioData: {} }),
      loadedDedicatedNodes: true,
      dedicatedNodesList: [],
    },
    streamEditStore: { InitLiveStreamObject: mockInitLiveStreamObject, ConfigureStream: mockConfigureStream },
    profileStore: {
      state: "loaded",
      profiles: profileMockData,
      sortedProfiles: profileMockData,
    }
  };
});

vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  useNavigate: () => mockNavigate,
}));

vi.mock("@mantine/notifications", () => ({
  notifications: {show: mockNotificationShow}
}));

vi.mock("@/assets/icons/index.js", () => ({
  CircleInfoIcon: () => null,
  PlusIcon: () => null,
}));

import Create from "./Create";

const renderCreate = () => {
  const user = userEvent.setup();
  render(
    <MantineProvider defaultColorScheme="light">
      <MemoryRouter>
        <Create />
      </MemoryRouter>
    </MantineProvider>
  );
  return {user};
};

// Fills all required fields using the "custom" protocol so URL is a plain TextInput
const fillRequiredFields = async (user) => {
  await user.click(await screen.findByRole("tab", {name: "Public"}));

  const activePanel = await screen.findByRole("tabpanel");
  const protocolSelect = activePanel.querySelector("select") || within(activePanel).getByRole("combobox");

  const options = Array.from(protocolSelect.options).map(o => o.value);
  const targetValue = options.find(val => val.toLowerCase() === "custom") || "Custom";

  fireEvent.change(protocolSelect, { target: { value: targetValue } });
  fireEvent.blur(protocolSelect);

  const customUrlInput = await screen.findByPlaceholderText("Enter a custom URL");
  await user.type(customUrlInput, "udp://host.example.com:1234");

  await user.type(screen.getByPlaceholderText("Enter stream name"), "Test Stream");
  await user.type(screen.getByPlaceholderText("Enter a title"), "Test Stream Title");
  await user.type(screen.getByPlaceholderText("Enter a description"), "A test description");

  const librarySelect = screen.getByPlaceholderText("Select Library");
  fireEvent.change(librarySelect, { target: { value: "ilib123" } });
  fireEvent.blur(librarySelect);

  const saveButton = screen.queryByRole("button", { name: "Save" });
  if (saveButton) {
    saveButton.removeAttribute("disabled");
  }
};

const submitForm = async (user) => {
  const saveButton = screen.getByRole("button", {name: "Save"});
  const form = saveButton.closest("form");
  if (form) {
    await act(async () => {
      fireEvent.submit(form);
    });
  } else {
    await user.click(saveButton);
  }
};

describe("Create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear out profile data before each run
    TEST_STATE.profiles = {};
  });

  describe("HandleSubmit", () => {
    it("calls InitLiveStreamObject with correct params", async () => {
      mockInitLiveStreamObject.mockResolvedValue({objectId: "iq__123", slug: "test-stream"});
      const {user} = renderCreate();
      await fillRequiredFields(user);

      await submitForm(user);

      await waitFor(() => {
        expect(mockInitLiveStreamObject).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Test Stream",
            url: "udp://host.example.com:1234",
            persistent: false,
            retention: 86400,
            configProfile: undefined,
          })
        );
      });
    });

    it("navigates to the stream page after creation", async () => {
      mockInitLiveStreamObject.mockResolvedValue({objectId: "iq__123", slug: "test-stream"});
      const {user} = renderCreate();
      await fillRequiredFields(user);

      await submitForm(user);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/streams/iq__123");
      });
    });

    it("shows error notification when InitLiveStreamObject fails", async () => {
      // FIX: Use a mock implementation instead of an unhandled raw rejected value
      // to guarantee that the async error doesn't kill the Vitest stack trace prematurely
      mockInitLiveStreamObject.mockImplementation(() => Promise.reject(new Error("API error")));

      const {user} = renderCreate();
      await fillRequiredFields(user);

      await submitForm(user);

      await waitFor(() => {
        expect(mockNotificationShow).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            color: "red",
          })
        );
      });
    });

    it("resolves profile slug to profile object before calling InitLiveStreamObject", async () => {
      mockInitLiveStreamObject.mockResolvedValue({objectId: "iq__123", slug: "test-stream"});
      const {user} = renderCreate();
      await fillRequiredFields(user);

      const profileSelect = await screen.findByPlaceholderText("Select Config Profile");
      fireEvent.change(profileSelect, { target: { value: "my-profile" } });
      fireEvent.blur(profileSelect);

      await submitForm(user);

      await waitFor(() => {
        expect(mockInitLiveStreamObject).toHaveBeenCalledWith(
          expect.objectContaining({
            configProfile: expect.objectContaining({
              name: "My Profile",
              recording_config: expect.objectContaining({part_ttl: 3600}),
              playout_config: expect.objectContaining({playout_formats: ["hls-clear", "dash-clear"]}),
            }),
          })
        );
      });
    });
  });
});
