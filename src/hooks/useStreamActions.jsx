import {rootStore} from "@/stores/index.js";
import {Stack, Text} from "@mantine/core";
import {SanitizeUrl} from "@/utils/helpers.js";
import {notifications} from "@mantine/notifications";
import {STATUS_MAP} from "@/utils/constants.js";

export const useStreamActions = () => {
  const HandleCheckAction = async({data, event}) => {
    event.stopPropagation();

    const url = await rootStore.streamBrowseStore.client.ContentObjectMetadata({
      libraryId: await rootStore.streamBrowseStore.client.ContentObjectLibraryId({objectId: data.objectId}),
      objectId: data.objectId,
      metadataSubtree: "live_recording_config/url"
    });

    rootStore.modalStore.SetModal({
      data: {
        objectId: data.objectId,
        name: data.title,
        loadingText: () => (
          <Stack mt={16} gap={5}>
            <Text>
              Please send your stream to:
            </Text>
            <Text>
              {
                SanitizeUrl({url, removeQueryParams: ["mode"]}) || "the URL you specified"
              }
            </Text>
          </Stack>
        )
      },
      op: "CHECK",
      slug: data.slug,
      activeMessage: data.status !== STATUS_MAP.INACTIVE,
      notifications
    });
  };

  const HandleStopAction = ({data, event}) => {
    event.stopPropagation();

    rootStore.modalStore.SetModal({
      data: {
        objectId: data.objectId,
        name: data.title
      },
      op: "STOP",
      slug: data.slug,
      notifications
    });
  };

  const HandleStartAction = ({data, event}) => {
    event.stopPropagation();

    rootStore.modalStore.SetModal({
      data: {
        objectId: data.objectId,
        name: data.title
      },
      op: "START",
      slug: data.slug,
      notifications
    });
  };

  const HandleFabricBrowserAction = ({data, event}) => {
    event.stopPropagation();

    rootStore.streamBrowseStore.client.SendMessage({
      options: {
        operation: "OpenLink",
        libraryId: data.libraryId,
        objectId: data.objectId
      },
      noResponse: true
    });
  };

  const HandleDeactivateAction = ({data, event}) => {
    event.stopPropagation();

    rootStore.modalStore.SetModal({
      data: {
        objectId: data.objectId,
        name: data.title,
        customMessage: () => (
          <Stack gap={0} mb={8}>
            <Text c="elv-gray.9">Are you sure you want to deactivate the stream?</Text>
            <Text fw={700} c="elv-gray.9">You will lose all recording media. Be sure to save a VoD copy first.</Text>
          </Stack>
        )
      },
      op: "DEACTIVATE",
      slug: data.slug,
      notifications
    });
  };

  const HandleDeleteAction = ({data, event}) => {
    event.stopPropagation();

    rootStore.modalStore.SetModal({
      data: {
        objectId: data.objectId,
        name: data.title
      },
      op: "DELETE",
      slug: data.slug,
      notifications
    });
  };

  return {
    HandleCheckAction,
    HandleStopAction,
    HandleStartAction,
    HandleFabricBrowserAction,
    HandleDeactivateAction,
    HandleDeleteAction
  };
};
