// "use client";

import {useState} from "react";
import {observer} from "mobx-react-lite";
import {Link, useNavigate} from "react-router-dom";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconExternalLink,
  IconDeviceAnalytics,
  IconListCheck,
  IconCircleX
} from "@tabler/icons-react";

import {dataStore, modalStore, streamBrowseStore} from "@/stores";
import {SanitizeUrl, SortTable, VideoBitrateReadable, StreamIsActive} from "@/utils/helpers";
import {STATUS_MAP} from "@/utils/constants";
import {CODEC_TEXT, FORMAT_TEXT} from "@/utils/constants";

import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import {DataTable} from "mantine-datatable";
import {notifications} from "@mantine/notifications";
import {ActionIcon, Group, TextInput, Stack, Title, Box, Flex, Button, Text} from "@mantine/core";

import StatusText from "@/components/status-text/StatusText.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {MagnifyingGlassIcon} from "@/assets/icons/index.js";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import styles from "./Streams.module.css";
import CopyButton from "@/components/copy-button/CopyButton.jsx";
import {useContextMenu} from "mantine-contextmenu";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);
  const navigate = useNavigate();

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.Initialize(true);
  }, 500);

  const {showContextMenu} = useContextMenu();

  const records = Object.values(streamBrowseStore.streams || {})
    .filter(record => {
      return (
        !debouncedFilter ||
        record.title?.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        record.objectId?.toLowerCase().includes(debouncedFilter.toLowerCase())
      );
    })
    .sort(SortTable({sortStatus}));

  const HandleContextMenu = ({record, event}) => {
    event.preventDefault();

    const contextMenuIconProps = {
      color: "var(--mantine-color-elv-gray-6)",
      size: 20
    };

    const menuItems = [
      {
        key: "check",
        color: "var(--mantine-color-elv-gray-9)",
        icon: <IconListCheck {...contextMenuIconProps} />,
        hidden: ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE].includes(record.status),
        onClick: () => {}
      },
      {
        key: "view",
        color: "var(--mantine-color-elv-gray-9)",
        icon: <IconDeviceAnalytics {...contextMenuIconProps} />,
        hidden: !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(record.status),
        onClick: () => {}
      },
      {
        key: "start",
        color: "var(--mantine-color-elv-gray-9)",
        icon: <IconPlayerPlay {...contextMenuIconProps} />,
        hidden: !record.status || ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(record.status),
        onClick: () => {}
      },
      {
        key: "stop",
        color: "var(--mantine-color-elv-gray-9)",
        icon: <IconPlayerStop {...contextMenuIconProps} />,
        hidden: !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(record.status),
        onClick: () => {}
      },
      {key: "divider-1"},
      {
        key: "open-in-fabric-browser",
        color: "var(--mantine-color-elv-gray-9)",
        title: "Open in Fabric Browser",
        icon: <IconExternalLink {...contextMenuIconProps} />,
        hidden: !record.objectId,
        onClick: () => {}
      },
      {key: "divider-2"},
      {
        key: "deactivate",
        color: "var(--mantine-color-elv-gray-9)",
        icon: <IconCircleX {...contextMenuIconProps} />,
        hidden: !record.status || record.status !== STATUS_MAP.STOPPED,
        onClick: () => {}
      },
      {
        key: "delete",
        color: "var(--mantine-color-elv-gray-9)",
        icon: <IconTrash {...contextMenuIconProps} />,
        disabled: StreamIsActive(record.status),
        onClick: () => {}
      }
    ];

    showContextMenu(menuItems)(event);
  };

  return (
    <PageContainer
      title="Streams"
    >
      <Flex w="100%" align="center" mb={16}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<MagnifyingGlassIcon width={15} height={15} />}
          mb={14}
          value={filter}
          onChange={event => setFilter(event.target.value)}
        />
        <Button
          onClick={DebouncedRefresh}
          variant="outline"
          ml="auto"
        >
          Refresh
        </Button>
      </Flex>

      <Box className={styles.tableWrapper}>
        <DataTable
          highlightOnHover
          idAccessor="objectId"
          minHeight={(!records || records.length === 0) ? 130 : 75}
          fetching={!dataStore.loaded}
          records={records}
          onRowContextMenu={HandleContextMenu}
          onRowClick={({record}) => {
            if(!record.objectId) { return; }

            navigate(`/streams/${record.objectId || record.slug}`);
          }}
          emptyState={
            // Mantine bug where empty state link still present underneath table rows
            !records &&
            <div className={styles.emptyDataTable}>
              <div className={styles.emptyDataTableText}>
                No streams available
              </div>
              <Link className="button button__primary" to="/create">
                <div className="button__link-inner">
                  <span className="button__link-text">
                    Create New Stream
                  </span>
                </div>
              </Link>
            </div>
          }
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          columns={[
            { accessor: "title", title: "Name", sortable: true, render: record => (
              <Stack gap={0} maw="100%">
                <Title order={3} lineClamp={1} title={record.title || record.slug} style={{wordBreak: "break-all"}}>
                  {record.title || record.slug}
                </Title>
                <CopyButton
                  value={record.objectId}
                  textComponent={
                    <Title order={6} c="elv-gray.6" lineClamp={1}>
                      {record.objectId}
                    </Title>
                  }
                />

              </Stack>
            )},
            {
              accessor: "originUrl",
              title: "URL",
              render: record => (
                <BasicTableRowText title={SanitizeUrl({url: record.originUrl})} lineClamp={1}>
                  {SanitizeUrl({url: record.originUrl})}
                </BasicTableRowText>
              )
            },
            {
              accessor: "format",
              title: "Format",
              render: record => (
                <BasicTableRowText style={{textWrap: "nowrap"}}>
                  {FORMAT_TEXT[record.format]}
                </BasicTableRowText>
              )
            },
            {
              accessor: "video",
              title: "Video",
              render: record => (
                <BasicTableRowText style={{textWrap: "nowrap"}}>
                  {CODEC_TEXT[record.codecName]} {VideoBitrateReadable(record.videoBitrate)}
                </BasicTableRowText>
              )
            },
            {
              accessor: "audioStreams",
              title: "Audio",
              render: record => (
                <BasicTableRowText miw="100%" textWrap="nowrap">
                  {record.audioStreamCount ? `${record.audioStreamCount} ${record.audioStreamCount > 1 ? "streams" : "stream"}` : ""}
                </BasicTableRowText>
              )
            },
            {
              accessor: "status",
              title: "Status",
              sortable: true,
              render: record => !record.status ? null :
                <StatusText
                  status={record.status}
                  quality={record.quality}
                  size="md"
                />
            },
            {
              accessor: "actions",
              title: "",
              render: record => {
                return (
                  <Group gap={7} justify="right" wrap="nowrap">
                    {
                      ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE].includes(record.status) ? null :
                        <ActionIcon
                          title="Check Stream"
                          variant="subtle"
                          color="gray.6"
                          onClick={async (e) => {
                            e.stopPropagation();

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
                                      {
                                        SanitizeUrl({url, removeQueryParams: ["mode"]}) || "the URL you specified"
                                      }
                                    </Text>
                                  </Stack>
                                )
                              },
                              op: "CHECK",
                              slug: record.slug,
                              activeMessage: record.status !== STATUS_MAP.INACTIVE,
                              notifications
                            });
                          }}
                        >
                          <IconListCheck />
                        </ActionIcon>
                    }
                    {
                      !record.status || ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(record.status) ? null :
                        <ActionIcon
                          title="Start Stream"
                          variant="subtle"
                          color="gray.6"
                          onClick={(e) => {
                            e.stopPropagation();

                            modalStore.SetModal({
                              data: {
                                objectId: record.objectId,
                                name: record.title
                              },
                              op: "START",
                              slug: record.slug,
                              notifications
                            });
                          }}
                        >
                          <IconPlayerPlay />
                        </ActionIcon>
                    }
                    {
                      !record.status || record.status !== STATUS_MAP.STOPPED ? null :
                        <ActionIcon
                          title="Deactivate Stream"
                          variant="subtle"
                          color="gray.6"
                          onClick={(e) => {
                            e.stopPropagation();

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
                          }}
                        >
                          <IconCircleX />
                        </ActionIcon>
                    }
                    {
                      !record.status || ![STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(record.status) ? null :
                        <>
                          <ActionIcon
                            onClick={(e) => {
                              e.stopPropagation();

                              navigate(`/streams/${record.objectId}/preview`);
                            }}
                            title="View Stream"
                            variant="subtle"
                            color="gray.6"
                          >
                            <IconDeviceAnalytics />
                          </ActionIcon>
                          <ActionIcon
                            title="Stop Stream"
                            variant="subtle"
                            color="gray.6"
                            onClick={(e) => {
                              e.stopPropagation();

                              modalStore.SetModal({
                                data: {
                                  objectId: record.objectId,
                                  name: record.title
                                },
                                op: "STOP",
                                slug: record.slug,
                                notifications
                              });
                            }}
                          >
                            <IconPlayerStop />
                          </ActionIcon>
                        </>
                    }
                    {
                      !!record.objectId &&
                      <ActionIcon
                        title="Open in Fabric Browser"
                        variant="subtle"
                        color="gray.6"
                        onClick={(e) => {
                          e.stopPropagation();

                          streamBrowseStore.client.SendMessage({
                            options: {
                              operation: "OpenLink",
                              libraryId: record.libraryId,
                              objectId: record.objectId
                            },
                            noResponse: true
                          });
                        }}
                      >
                        <IconExternalLink />
                      </ActionIcon>
                    }
                    <ActionIcon
                      title="Delete Stream"
                      variant="subtle"
                      color="gray.6"
                      disabled={StreamIsActive(record.status)}
                      onClick={(e) => {
                        e.stopPropagation();

                        modalStore.SetModal({
                          data: {
                            objectId: record.objectId,
                            name: record.title
                          },
                          op: "DELETE",
                          slug: record.slug,
                          notifications
                        });
                      }}
                    >
                      <IconTrash />
                    </ActionIcon>
                  </Group>
                );
              }
            }
          ]}
        />
      </Box>
    </PageContainer>
  );
});

export default Streams;
