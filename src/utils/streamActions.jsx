import {SanitizeUrl, StreamIsActive} from "@/utils/helpers.js";
import {STATUS_MAP} from "@/utils/constants.js";
import {Stack, Text} from "@mantine/core";
import {modalStore, streamBrowseStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import {
  IconCircleX,
  IconDeviceAnalytics,
  IconExternalLink,
  IconListCheck,
  IconPlayerPlay,
  IconPlayerStop, IconTrash
} from "@tabler/icons-react";
import {Link} from "react-router-dom";

export const GetStreamActions = ({record, onCheckComplete, onDeleteComplete}) => {
  return [
    {
      label: "Check",
      title: "Check Stream",
      icon: <IconListCheck />,
      primary: [STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNCONFIGURED].includes(record.status),
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      hidden: ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE].includes(record.status),
      onClick: async() => {
        const url = await streamBrowseStore.client.ContentObjectMetadata({
          libraryId: await streamBrowseStore.client.ContentObjectLibraryId({objectId: record.objectId}),
          objectId: record.objectId,
          metadataSubtree: "live_recording_config/url"
        });

        modalStore.SetModal({
          data: {
            objectId: record.objectId,
            name: record.title,
            loadingText: (
              <Stack mt={16} gap={5}>
                <Text>
                  Please send your stream to:
                </Text>
                <Text>
                  {SanitizeUrl({url, removeQueryParams: ["mode"]}) || "the URL you specified"}
                </Text>
              </Stack>
            )
          },
          op: "CHECK",
          slug: record.slug,
          Callback: onCheckComplete,
          activeMessage: record.status !== STATUS_MAP.INACTIVE,
          notifications
        });
      }
    },
    {
      label: "Start",
      title: "Start Stream",
      icon: <IconPlayerPlay />,
      primary: [STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(record.status),
      iconVariant: "subtle",
      buttonVariant: "filled",
      iconColor: "gray.6",
      hidden: !record.status || ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(record.status),
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: record.objectId,
            name: record.title
          },
          op: "START",
          slug: record.slug,
          notifications
        });
      }
    },
    {
      label: "Deactivate",
      title: "Deactivate Stream",
      icon: <IconCircleX />,
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      hidden: !record.status || record.status !== STATUS_MAP.STOPPED,
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: record.objectId,
            name: record.title,
            customMessage: (
              <Stack gap={0} mb={8}>
                <Text c="elv-gray.9">Are you sure you want to deactivate the stream?</Text>
                <Text fw={700} c="elv-gray.9">You will lose all recording media. Be sure to save a VoD copy first.</Text>
              </Stack>
            )
          },
          op: "DEACTIVATE",
          slug: record.slug,
          notifications
        });
      }
    },
    {
      label: "View",
      title: "View Stream",
      icon: <IconDeviceAnalytics />,
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      hidden: !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(record.status),
      component: Link,
      to: `/streams/${record.objectId}/preview`
    },
    {
      label: "Stop",
      title: "Stop Stream",
      icon: <IconPlayerStop />,
      primary: [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(record.status),
      iconVariant: "subtle",
      buttonVariant: "filled",
      iconColor: "gray.6",
      hidden: !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(record.status),
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: record.objectId,
            name: record.title
          },
          op: "STOP",
          slug: record.slug,
          notifications
        });
      }
    },
    {
      label: "Open in Fabric Browser",
      title: "Open in Fabric Browser",
      icon: <IconExternalLink />,
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      hidden: !record.objectId,
      onClick: () => streamBrowseStore.client.SendMessage({
        options: {
          operation: "OpenLink",
          libraryId: record.libraryId,
          objectId: record.objectId
        },
        noResponse: true
      })
    },
    {
      label: "Delete",
      title: "Delete Stream",
      icon: <IconTrash />,
      iconVariant: "subtle",
      iconColor: "gray.6",
      buttonVariant: "outline",
      disabled: StreamIsActive(record.status),
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: record.objectId,
            name: record.title
          },
          op: "DELETE",
          slug: record.slug,
          notifications,
          Callback: onDeleteComplete
        });
      }
    }
  ];
};
