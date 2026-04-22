import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {vi, describe, it, expect, beforeEach} from "vitest";
import {MemoryRouter} from "react-router-dom";
import {MantineProvider} from "@mantine/core";

const {mockInitLiveStreamObject, mockConfigureStream, mockNavigate, mockNotificationShow} = vi.hoisted(() => ({
  mockInitLiveStreamObject: vi.fn(),
  mockConfigureStream: vi.fn(),
  mockNavigate: vi.fn(),
  mockNotificationShow: vi.fn(),
}));

vi.mock("@/stores", () => ({
  rootStore: {
    errorMessage: null,
    client: {
      permissionLevels: {
        editable: {short: "Editable", description: "Can edit content"},
        owner: {short: "Owner", description: "Full owner access"},
      }
    }
  },
  dataStore: {
    tenantId: "tenant123",
    libraries: {"ilib123": {name: "Test Library"}},
    accessGroups: {},
    liveStreamUrls: {},
    LoadAccessGroups: vi.fn().mockResolvedValue(undefined),
    LoadDedicatedNodes: vi.fn().mockResolvedValue(undefined),
    LoadLibraries: vi.fn().mockResolvedValue(undefined),
    LoadStreamUrls: vi.fn().mockResolvedValue(undefined),
    LoadStreamProbeData: vi.fn().mockResolvedValue({audioStreams: [], audioData: {}}),
    loadedDedicatedNodes: true,
    dedicatedNodesList: [],
  },
  streamEditStore: {InitLiveStreamObject: mockInitLiveStreamObject, ConfigureStream: mockConfigureStream},
  profileStore: {
    state: "loaded",
    profiles: {},
    sortedProfiles: {},
  }
}));

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
  await user.click(screen.getAllByDisplayValue("MPEG-TS")[0]);
  const protocolDropdown = await screen.findByRole("listbox");
  await user.click(within(protocolDropdown).getByText("Custom"));
  await user.type(await screen.findByPlaceholderText("Enter a custom URL"), "udp://host.example.com:1234");
  await user.type(screen.getByPlaceholderText("Enter stream name"), "Test Stream");
  await user.type(screen.getByPlaceholderText("Enter a title"), "Test Stream Title");
  await user.type(screen.getByPlaceholderText("Enter a description"), "A test description");

  fireEvent.click(screen.getByPlaceholderText("Select Library"));
  fireEvent.click(await screen.findByText("Test Library"));
};

describe("Create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("HandleSubmit", () => {
    it("calls InitLiveStreamObject with correct params", async () => {
      mockInitLiveStreamObject.mockResolvedValue({objectId: "iq__123", slug: "test-stream"});
      const {user} = renderCreate();
      await fillRequiredFields(user);

      await user.click(screen.getByRole("button", {name: "Save"}));

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

      await user.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/streams/iq__123");
      });
    });

    it("shows error notification when InitLiveStreamObject fails", async () => {
      mockInitLiveStreamObject.mockRejectedValue(new Error("API error"));
      const {user} = renderCreate();
      await fillRequiredFields(user);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

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
      const {profileStore} = await import("@/stores");
      profileStore.profiles["my-profile"] = {
        name: "My Profile",
        recording_config: {part_ttl: 3600},
        playout_config: {playout_formats: ["hls-clear"]}
      };
      profileStore.sortedProfiles["my-profile"] = profileStore.profiles["my-profile"];

      mockInitLiveStreamObject.mockResolvedValue({objectId: "iq__123", slug: "test-stream"});
      const {user} = renderCreate();
      await fillRequiredFields(user);

      fireEvent.click(await screen.findByPlaceholderText("Select Config Profile"));
      fireEvent.click(await screen.findByText("My Profile"));

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => {
        expect(mockInitLiveStreamObject).toHaveBeenCalledWith(
          expect.objectContaining({
            configProfile: expect.objectContaining({
              name: "My Profile",
              recording_config: expect.objectContaining({part_ttl: 3600}),
              playout_config: expect.objectContaining({playout_formats: ["hls-clear"]}),
            }),
          })
        );
      });
    });
  });
});
