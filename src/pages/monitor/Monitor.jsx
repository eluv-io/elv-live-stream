import {useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Button, Flex, Group, Loader, Menu, SimpleGrid, Text, TextInput} from "@mantine/core";
import {useDebouncedValue} from "@mantine/hooks";

import {dataStore, streamStore} from "@/stores";
import {SortTable} from "@/utils/helpers";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {ExternalLinkIcon, MagnifyingGlassIcon, TrashIcon} from "@/assets/icons/index.js";
import StatusText from "@/components/status-text/StatusText.jsx";
import {IconCopy, IconDeviceAnalytics, IconDotsVertical, IconPlayerPlay, IconPlayerStop} from "@tabler/icons-react";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";

const OverflowMenu = observer(() => {
  const initModalData = {
    show: false,
    title: "",
    message: "",
    name: "",
    loadingText: "",
    objectId: "",
    confirmText: "",
    ConfirmCallback: null,
    CloseCallback: null,
    danger: false
  };
  const [modalData, setModalData] = useState(initModalData);

  const OPTIONS = [
    {id: "embed-link", label: "Copy Embed URL", Icon: <IconCopy width={18} height={18} />},
    {id: "divider-1", divider: true},
    {id: "view-stream", label: "View Stream", Icon: <IconDeviceAnalytics width={18} height={18} />},
    {id: "stop-stream", label: "Stop Stream", Icon: <IconPlayerStop width={18} height={18} />},
    {id: "fabric-browser-stream", label: "Open in Fabric Browser", Icon: <ExternalLinkIcon width={18} height={18} />},
    {id: "delete-stream", label: "Delete Stream", Icon: <TrashIcon width={18} height={18} />, onClick: () => setModalData({

      })},
  ];

  return (
    <Menu ml="auto" position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="white" color="elv-black.2">
          <IconDotsVertical height={20} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {
          OPTIONS.map(item => (
            item.divider ?
              <Menu.Divider key={item.id} /> :
              <Menu.Item
                key={item.id}
                leftSection={item.Icon}
                color="var(--mantine-color-elv-gray-9)"
                onClick={() => item.Callback()}
              >
                { item.label }
              </Menu.Item>
          ))
        }
      </Menu.Dropdown>
      <ConfirmModal
        {...modalData}
      />
    </Menu>
  );
});

const GridItem = observer(({stream, index}) => {
  return (
    <Flex direction="column">
      <VideoContainer
        index={index}
        slug={stream.slug}
        showPreview={streamStore.showMonitorPreviews}
      />
      <Flex flex={1} p="0.5rem 0 0.5rem">
        <Flex direction="column" justify="space-between" w="100%">
          <Group mb={6} gap={10} w="100%" wrap="nowrap">
            {
              stream.status !== "running" &&
              <Button size="xs" mih="15px" h={25} leftSection={<IconPlayerPlay height={16} width={16} />}>
                <Text fz={10}>
                  Start Stream
                </Text>
              </Button>
            }
            <Text fw={700} fz={14} truncate="end">
              { stream.title }
            </Text>
            <OverflowMenu />
          </Group>
          <Text c="elv-black.1" fz={14} fw={400} mb={2}>
            { stream.objectId || "" }
          </Text>
          <Flex align="flex-end" justify="space-between">
            {
              stream.status &&
              <StatusText status={stream.status} size="xs" />
            }
            {/*{*/}
            {/*  stream.embedUrl &&*/}
            {/*  <Anchor*/}
            {/*    href={stream.embedUrl}*/}
            {/*    underline="never"*/}
            {/*    target="_blank"*/}
            {/*    rel="noreferrer"*/}
            {/*    fz="0.6rem"*/}
            {/*    style={{textDecoration: "none"}}*/}
            {/*  >*/}
            {/*    Embed URL*/}
            {/*  </Anchor>*/}
            {/*}*/}
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
    >
      <Flex w="100%" align="center" mb="md">
        <TextInput
          flex={2}
          maw={400}
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
            <div style={{maxWidth: "200px"}}>
              <Loader />
            </div> :
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
