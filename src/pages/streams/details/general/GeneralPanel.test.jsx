import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {vi, describe, it, expect, beforeEach} from "vitest";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {MantineProvider} from "@mantine/core";
// Import the mocked store so individual tests can mutate per-test stream data.
// vi.mock is hoisted, so this import resolves to the mock factory's return value.
import {streamStore} from "@/stores";

const {mockUpdateGeneralConfig, mockNotificationShow} = vi.hoisted(() => ({
  mockUpdateGeneralConfig: vi.fn(),
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
    LoadDetails: vi.fn().mockResolvedValue(undefined),
    LoadPermission: vi.fn().mockResolvedValue("editable"),
    LoadAccessGroupPermissions: vi.fn().mockResolvedValue(""),
    LoadAccessGroups: vi.fn().mockResolvedValue(undefined),
    LoadDedicatedNodes: vi.fn().mockResolvedValue(undefined),
    loadedDedicatedNodes: true,
    dedicatedNodesList: [],
    accessGroups: {},
    client: {
      permissionLevels: {
        editable: {short: "Editable", description: "Can edit content"},
        owner: {short: "Owner", description: "Full owner access"},
      }
    },
  },
  streamEditStore: {UpdateGeneralConfig: mockUpdateGeneralConfig},
  streamStore: {
    LoadGeneralConfigData: vi.fn().mockResolvedValue(undefined),
    streams: {
      "test-slug": {
        title: "Test Stream",
        description: "A test stream",
        display_title: "Test Stream Title",
        originUrl: "udp://host.example.com:1234"
      }
    }
  },
  profileStore: {
    state: "loaded",
    profiles: {
      "my-profile": {name: "My Profile", recording_config: {part_ttl: 3600}}
    },
    sortedProfiles: {
      "my-profile": {name: "My Profile", recording_config: {part_ttl: 3600}}
    },
    LoadProfiles: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("@mantine/notifications", () => ({
  notifications: {show: mockNotificationShow}
}));

vi.mock("@/assets/icons/index.js", () => ({
  CircleInfoIcon: () => null,
}));

vi.mock("@/components/section-title/SectionTitle.jsx", () => ({
  default: ({children}) => <div>{children}</div>
}));

vi.mock("@/components/notification-message/NotificationMessage.jsx", () => ({
  default: ({children}) => <div>{children}</div>
}));

import GeneralPanel from "@/pages/streams/details/general/GeneralPanel.jsx";

const renderGeneralPanel = (props = {}) => {
  const user = userEvent.setup();
  render(
    <MantineProvider defaultColorScheme="light">
      <MemoryRouter initialEntries={["/streams/iq__123"]}>
        <Routes>
          <Route
            path="/streams/:id"
            element={<GeneralPanel slug="test-slug" currentConfigProfile="" {...props} />}
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  );
  return {user};
};

describe("GeneralPanel", () => {
  const baseStream = {
    title: "Test Stream",
    description: "A test stream",
    display_title: "Test Stream Title",
    originUrl: "udp://host.example.com:1234"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset stream to base state so per-test mutations don't leak.
    streamStore.streams["test-slug"] = {...baseStream};
  });

  describe("Config Profile", () => {
    it("calls UpdateGeneralConfig with selected profile slug when a profile is chosen", async () => {
      mockUpdateGeneralConfig.mockResolvedValue(undefined);
      const {user} = renderGeneralPanel();

      await user.click(await screen.findByPlaceholderText("Select Config Profile"));
      await user.click(await screen.findByText("My Profile"));

      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => {
        expect(mockUpdateGeneralConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            configProfile: "my-profile"
          })
        );
      });
    });

    it("calls UpdateGeneralConfig with empty configProfile when no profile is selected", async () => {
      mockUpdateGeneralConfig.mockResolvedValue(undefined);
      renderGeneralPanel();

      fireEvent.click(await screen.findByRole("button", {name: "Save"}));

      await waitFor(() => {
        expect(mockUpdateGeneralConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            configProfile: ""
          })
        );
      });
    });

    it("initializes with currentConfigProfile when provided", async () => {
      // The useEffect reads stream.configProfile to set the select value.
      // Ensure the mock stream carries the profile slug so the loaded state
      // matches the prop, otherwise setConfigProfile("") would reset it.
      streamStore.streams["test-slug"] = {...baseStream, configProfile: "my-profile"};
      renderGeneralPanel({currentConfigProfile: "my-profile"});

      const select = await screen.findByDisplayValue("My Profile");
      expect(select).toBeTruthy();
    });
  });
});
