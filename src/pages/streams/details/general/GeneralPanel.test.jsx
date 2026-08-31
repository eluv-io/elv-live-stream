import {render, screen, fireEvent, waitFor, act} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {vi, describe, it, expect, beforeEach} from "vitest";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {MantineProvider} from "@mantine/core";
// Import the mocked store so individual tests can mutate per-test stream data.
// vi.mock is hoisted, so this import resolves to the mock factory's return value.
import {streamStore} from "@/stores/index.ts";

const {
  mockUpdateGeneralConfig,
  mockNotificationShow,
  mockRegister,
  mockUnregister,
  mockSetDirty
} = vi.hoisted(() => ({
  mockUpdateGeneralConfig: vi.fn(),
  mockNotificationShow: vi.fn(),
  mockRegister: vi.fn(),
  mockUnregister: vi.fn(),
  mockSetDirty: vi.fn(),
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
  // GeneralPanel registers its Save/Discard callbacks with streamSaveStore on
  // mount and reports dirty state on every form change — the panel no longer
  // renders its own Save button, so tests trigger a save by invoking the
  // captured Save callback directly (mirroring StreamDetailsPage's toolbar).
  streamSaveStore: {
    Register: mockRegister,
    Unregister: mockUnregister,
    SetDirty: mockSetDirty
  },
  streamStore: {
    LoadDetails: vi.fn().mockResolvedValue({}),
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
            element={<GeneralPanel slug="test-slug" currentConfigProfile="" active {...props} />}
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
    it("should register a Save callback with streamSaveStore on mount", async () => {
      renderGeneralPanel();

      await screen.findByPlaceholderText("Select Config Profile");

      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "general",
          Save: expect.any(Function),
          Discard: expect.any(Function)
        })
      );
    });

    it("calls UpdateGeneralConfig with selected profile slug when a profile is chosen", async () => {
      mockUpdateGeneralConfig.mockResolvedValue(undefined);
      const {user} = renderGeneralPanel();

      await user.click(await screen.findByPlaceholderText("Select Config Profile"));
      await user.click(await screen.findByText("My Profile"));

      fireEvent.click(screen.getByRole("checkbox"));

      // Save moved out of the panel to the shared page-level toolbar — drive
      // it the same way StreamDetailsPage does, by invoking the Save callback
      // the panel registered with streamSaveStore.
      const {Save} = mockRegister.mock.calls[0][0];
      await act(async () => {
        await Save();
      });

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

      // Wait for the async LoadData effect to populate name/url from the
      // stream before saving, otherwise form.validate() rejects the save.
      await screen.findByPlaceholderText("Select Config Profile");

      const {Save} = mockRegister.mock.calls[0][0];
      await act(async () => {
        await Save();
      });

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

    it("does not re-send an unchanged, already-assigned profile on save", async () => {
      streamStore.streams["test-slug"] = {...baseStream, configProfile: "my-profile"};
      mockUpdateGeneralConfig.mockResolvedValue(undefined);
      renderGeneralPanel();

      await screen.findByDisplayValue("My Profile");

      const {Save} = mockRegister.mock.calls[0][0];
      await act(async () => {
        await Save();
      });

      await waitFor(() => {
        expect(mockUpdateGeneralConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            configProfile: undefined
          })
        );
      });
    });
  });

  describe("Discard", () => {
    it("reverts unsaved field edits to the last-loaded stream values, not blank defaults", async () => {
      renderGeneralPanel();

      const nameInput = await screen.findByPlaceholderText("Enter stream name");
      await waitFor(() => expect(nameInput.value).toBe("Test Stream"));

      fireEvent.change(nameInput, {target: {value: "Unsaved Edit"}});
      expect(nameInput.value).toBe("Unsaved Edit");

      const {Discard} = mockRegister.mock.calls[0][0];
      await act(async () => {
        Discard();
      });

      // Regression: form.reset() must restore the values loaded from the
      // stream (via setInitialValues), not the blank useForm() defaults.
      // Mantine's uncontrolled-mode reset() remounts the input (key bump),
      // so re-query rather than reuse the pre-Discard element reference.
      await waitFor(() => expect(screen.getByPlaceholderText("Enter stream name").value).toBe("Test Stream"));
    });
  });
});
