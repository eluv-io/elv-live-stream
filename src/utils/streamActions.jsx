import {StreamIsActive} from "@/utils/stream.ts";
import {SanitizeUrl} from "@/utils/helpers.ts";
import {STATUS_MAP} from "@/utils/constants.ts";
import {Stack, Text} from "@mantine/core";
import {rootStore, modalStore, streamStore} from "@/stores/index.ts";
import {notifications} from "@mantine/notifications";
import {
  IconDeviceAnalytics,
  IconExternalLink,
  IconListCheck,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash
} from "@tabler/icons-react";
import {Link} from "react-router-dom";
import {EndIcon} from "@/assets/icons/index.js";

// No playable (fmp4) output when a stream is packaged as Transport Stream only.
const TsPackagingOnly = record => (record.packaging || []).length > 0 && !record.packaging.includes("fmp4");

export const GetStreamActions = ({record, onCheckComplete, onDeleteComplete, view}) => {
  const tsPackagingOnly = TsPackagingOnly(record);

  return [
    {
      label: "Check",
      title: "Check Stream",
      icon: <IconListCheck />,
      primary: [STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNCONFIGURED].includes(record.status),
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      mutatesStream: true,
      hidden: ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE].includes(record.status),
      onClick: async() => {
        const url = await streamStore.client.ContentObjectMetadata({
          libraryId: await streamStore.client.ContentObjectLibraryId({objectId: record.objectId}),
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
      mutatesStream: true,
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
      icon: <EndIcon />,
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      mutatesStream: true,
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
      title: tsPackagingOnly ? "Preview unavailable for Transport Stream-only packaging" : "View Stream",
      icon: <IconDeviceAnalytics />,
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      hidden: !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(record.status),
      disabled: tsPackagingOnly,
      // component=Link ignores Mantine's `disabled` prop, so drop the link/route when disabled -
      // renders as a real <button disabled> instead, which actually blocks the click.
      ...(tsPackagingOnly ? {} : {component: Link, to: `/streams/${record.objectId}/preview`})
    },
    {
      label: "Stop",
      title: "Stop Stream",
      icon: <IconPlayerStop />,
      primary: [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(record.status),
      iconVariant: "subtle",
      buttonVariant: "filled",
      iconColor: "gray.6",
      mutatesStream: true,
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
      label: "Restart",
      title: "Restart Recording",
      icon: <IconRefresh />,
      iconVariant: "subtle",
      buttonVariant: "outline",
      iconColor: "gray.6",
      mutatesStream: true,
      hidden: !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED, STATUS_MAP.STOPPED].includes(record.status),
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: record.objectId,
            name: record.title
          },
          op: "RESTART",
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
      hidden: !record.objectId || (view === "stream-details"),
      onClick: () => rootStore.OpenInFabricBrowser({
        libraryId: record.libraryId,
        objectId: record.objectId
      })
    },
    {
      label: "Delete",
      title: "Delete Stream",
      icon: <IconTrash />,
      iconVariant: "subtle",
      iconColor: "gray.6",
      buttonVariant: "outline",
      mutatesStream: true,
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
