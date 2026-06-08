import {useEffect, useMemo, useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Button, Flex, Group, Loader, Menu, Text, Title} from "@mantine/core";
import {useClipboard, useDebouncedValue} from "@mantine/hooks";
import Actions from "@/components/table/actions/Actions.jsx";
import TagFilterRow from "@/components/table/tag-filter-row/TagFilterRow.jsx";
import {useWindowVirtualizer} from "@tanstack/react-virtual";

import {dataStore, modalStore, rootStore, streamStore} from "@/stores/index.ts";
import {StreamIsActive} from "@/utils/stream.ts";
import {SortTable} from "@/utils/helpers.ts";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {ExternalLinkIcon, TrashIcon} from "@/assets/icons/index.js";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import {
  IconCircleX,
  IconCopy,
  IconDeviceAnalytics,
  IconDotsVertical,
  IconListCheck,
  IconPlayerPlay,
  IconPlayerStop
} from "@tabler/icons-react";
import {QUALITY_MAP, STATUS_MAP} from "@/utils/constants.ts";
import {notifications} from "@mantine/notifications";
import {useNavigate} from "react-router-dom";
import styles from "./Monitor.module.css";

const COLS = 4;

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
      onClick: async() => {
        const url = await streamStore.EmbedUrl({objectId: stream.objectId});
        clipboard.copy(url);
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
      onClick: () => rootStore.client.SendMessage({
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
        capLevelToPlayerSize
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
              <StatusIndicator
                status={stream.status}
                size="sm"
                showWarning={stream.status?.quality && stream.status.quality !== QUALITY_MAP.GOOD}
              />
            }
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
});

const Monitor = observer(() => {
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState([]);
  const [debouncedFilter] = useDebouncedValue(filter, 200);

  useEffect(() => {
    if(!dataStore.streamsLoaded) {
      dataStore.LoadSiteStreams();
    }
  }, []);

  const streams = useMemo(() => {
    if(!streamStore.streams) { return undefined; }
    const textFilter = debouncedFilter.toLowerCase();
    return Object.values(streamStore.streams)
      .filter(record => {
        const matchesText = !textFilter ||
          record.title?.toLowerCase().includes(textFilter) ||
          record.objectId?.toLowerCase().includes(textFilter);
        const matchesTags = tagFilter.length === 0 ||
          tagFilter.some(tag => record.tags?.includes(tag));
        return matchesText && matchesTags;
      })
      .sort(SortTable({sortStatus: {columnAccessor: "title", direction: "asc"}}));
  }, [streamStore.streams, debouncedFilter, tagFilter]);

  const rows = useMemo(() => {
    if(!streams) return [];
    const result = [];
    for(let i = 0; i < streams.length; i += COLS) {
      result.push(streams.slice(i, i + COLS));
    }

    return result;
  }, [streams]);

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 375,
    overscan: 2
  });

  return (
    <PageContainer
      title="Monitor"
    >
      <Actions
        mb={16}
        actions={[{
          label: streamStore.showMonitorPreviews ? "Hide Previews" : "Show Previews",
          id: "toggle-previews",
          variant: "outline",
          onClick: () => streamStore.ToggleMonitorPreviews()
        }]}
        searchValue={filter}
        onSearchChange={event => setFilter(event.target.value)}
        tagOptions={streamStore.allTags}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
      />
      <TagFilterRow
        tags={streamStore.allTags}
        selectedTags={tagFilter}
        onTagToggle={(tag) => setTagFilter(current =>
          current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
        )}
      />
      {
        !streams ?
          <Box maw={200}>
            <Loader />
          </Box> :
          streams.length === 0 ? (debouncedFilter ? "No Matching Streams" : "No Streams Found") :
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow, rowPos) => {
                const rowStreams = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                      display: "grid",
                      gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                      gap: "var(--mantine-spacing-lg)",
                      paddingBottom: "var(--mantine-spacing-lg)",
                    }}
                  >
                    {rowStreams.map((stream, colIndex) => (
                      <GridItem key={stream.slug} stream={stream} index={rowPos * COLS + colIndex} />
                    ))}
                  </div>
                );
              })}
            </div>
      }
    </PageContainer>
  );
});

export default Monitor;
