import {useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Button, Flex, Group, Loader, Menu, SimpleGrid, Text, TextInput, Title} from "@mantine/core";
import {useClipboard, useDebouncedValue} from "@mantine/hooks";

import {dataStore, editStore, modalStore, streamStore} from "@/stores";
import {SortTable, StreamIsActive} from "@/utils/helpers";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {ExternalLinkIcon, MagnifyingGlassIcon, TrashIcon} from "@/assets/icons/index.js";
import StatusText from "@/components/status-text/StatusText.jsx";
import {
  IconCircleX,
  IconCopy,
  IconDeviceAnalytics,
  IconDotsVertical,
  IconListCheck,
  IconPlayerPlay,
  IconPlayerStop
} from "@tabler/icons-react";
import {STATUS_MAP} from "@/utils/constants.js";
import {notifications} from "@mantine/notifications";
import {useNavigate} from "react-router-dom";
import styles from "./Monitor.module.css";

const OverflowMenu = observer(({stream}) => {
  const clipboard = useClipboard({timeout: 400});
  const navigate = useNavigate();

  const data = {
    objectId: stream.objectId,
    name: stream.title
  };

  const iconProps = {
    width: 18,
    height: 18
  };

  const OPTIONS = [
    {
      id: "embed-link",
      label: "Copy Embed URL",
      Icon: <IconCopy {...iconProps} />,
      hide: !stream.embedUrl,
      onClick: () => {
        clipboard.copy(stream.embedUrl);
        notifications.show({title: "Copied embed url", message: ""});
      }
    },
    {id: "divider-1", divider: true, hide: !stream.embedUrl},
    {
      id: "view-stream",
      label: "View Stream",
      Icon: <IconDeviceAnalytics {...iconProps} />,
      hide: !stream.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(stream.status),
      onClick: () => navigate(`/streams/${stream.objectId}/preview`)
    },
    {
      id: "check-stream",
      label: "Check Stream",
      Icon: <IconListCheck {...iconProps} />,
      hide: ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE].includes(stream.status),
      onClick: () => modalStore.SetModal({
        data,
        slug: stream.slug,
        op: "CHECK",
        notifications
      })
    },
    {
      id: "stop-stream",
      label: "Stop Stream",
      Icon: <IconPlayerStop {...iconProps} />,
      hide: !stream.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(stream.status),
      onClick: () => modalStore.SetModal({
        data,
        slug: stream.slug,
        op: "STOP",
        notifications
      })
    },
    {
      id: "fabric-browser-stream",
      label: "Open in Fabric Browser",
      Icon: <ExternalLinkIcon {...iconProps} />,
      onClick: () => editStore.client.SendMessage({
        options: {
          operation: "OpenLink",
          libraryId: stream.libraryId,
          objectId: stream.objectId
        },
        noResponse: true
      })
    },
    {
      id: "deactivate-stream",
      label: "Deactivate Stream",
      Icon: <IconCircleX {...iconProps} />,
      hide: !stream.status || stream.status !== STATUS_MAP.STOPPED,
      onClick: () => modalStore.SetModal({
        data,
        slug: stream.slug,
        op: "DEACTIVATE",
        notifications
      })
    },
    {
      id: "delete-stream",
      label: "Delete Stream",
      Icon: <TrashIcon {...iconProps} />,
      disabled: StreamIsActive(stream.status),
      onClick: () => modalStore.SetModal({
        data,
        slug: stream.slug,
        op: "DELETE",
        notifications
      })
    },
  ];

  return (
    <Menu ml="auto" position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="white" color="elv-gray.9" size="xs">
          <IconDotsVertical height={"100%"} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {
          OPTIONS
            .filter(item => !item.hide)
            .map(item => (
            item.divider ?
              <Menu.Divider key={item.id} /> :
              <Menu.Item
                key={item.id}
                leftSection={item.Icon}
                color="var(--mantine-color-elv-gray-9)"
                onClick={() => item.onClick()}
                disabled={item.disabled}
              >
                { item.label }
              </Menu.Item>
          ))
        }
      </Menu.Dropdown>
    </Menu>
  );
});

const GridItem = observer(({stream, index}) => {
  return (
    <Flex direction="column" w="100%">
      <VideoContainer
        index={index}
        slug={stream.slug}
        showPreview={streamStore.showMonitorPreviews}
        playable={stream.status === "running"}
      />
      <Flex flex={1} p="0.5rem 0 0.5rem" w="100%">
        <Flex direction="column" w="100%" gap={0}>
          <Group mb={5} gap={10} w="100%" maw="100%" wrap="nowrap">
            {
              stream.status && [STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(stream.status) &&
              <Button
                classNames={{root: styles.buttonInput, section: styles.buttonSection}}
                size="xs"
                mih="15px"
                h={25}
                leftSection={<IconPlayerPlay height={12} width={12} />}
                onClick={() => {
                  modalStore.SetModal({
                    data: {
                      objectId: stream.objectId,
                      name: stream.title
                    },
                    op: "START",
                    slug: stream.slug,
                    notifications
                  });
                }}
              >
                <Group gap={5}>
                  <Text fz={12} fw={600}>
                    Start Stream
                  </Text>
                </Group>
              </Button>
            }
            <Title order={3} lineClamp={1} c="elv-gray.9" lh={1}>
              { stream.title }
            </Title>
            <OverflowMenu stream={stream} />
          </Group>
          <Text c="elv-gray.6" fz={12} fw={500} mb={5} truncate="end" lh={1}>
            { stream.objectId || "" }
          </Text>
          <Flex align="flex-end" justify="space-between">
            {
              stream.status &&
              <StatusText status={stream.status} size="xs" />
            }
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
});

const Monitor = observer(() => {
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);

  const streams = !streamStore.streams ? undefined :
    Object.values(streamStore.streams || {})
      .filter(record => {
        return (
          !debouncedFilter ||
          record.title.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
          record.objectId.toLowerCase().includes(debouncedFilter.toLowerCase())
        );
      })
      .sort(SortTable({sortStatus: {columnAccessor: "title", direction: "asc"}}));

  return (
    <PageContainer
      title="Monitor"
      mb={16}
    >
      <Flex w="100%" align="center" mb={16}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<MagnifyingGlassIcon width="18px" height="18px" />}
          value={filter}
          onChange={event => setFilter(event.target.value)}
        />
        <Button
          onClick={() => streamStore.ToggleMonitorPreviews()}
          variant="outline"
          ml="auto"
        >
          { streamStore.showMonitorPreviews ? "Hide Previews" : "Show Previews" }
        </Button>
      </Flex>
      {
        !dataStore.tenantId ? null :
          !streams ?
            <Box maw={200}>
              <Loader />
            </Box> :
            streams.length === 0 ? (debouncedFilter ? "No Matching Streams" : "No Streams Found") :
              <SimpleGrid cols={4} spacing="lg">
                {
                  streams.map((stream, index) => {
                    return (
                      <GridItem
                        key={stream.slug}
                        stream={stream}
                        index={index}
                      />
                    );
                  })
                }
              </SimpleGrid>
      }
    </PageContainer>
  );
});

export default Monitor;
