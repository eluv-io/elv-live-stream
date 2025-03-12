// "use client";

import {useState} from "react";
import {observer} from "mobx-react-lite";
import {Link} from "react-router-dom";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconExternalLink,
  IconDeviceAnalytics,
  IconListCheck,
  IconCircleX
} from "@tabler/icons-react";

import {dataStore, editStore, modalStore, streamStore} from "@/stores";
import {SanitizeUrl, SortTable, VideoBitrateReadable, StreamIsActive} from "@/utils/helpers";
import {STATUS_MAP} from "@/utils/constants";
import {CODEC_TEXT, FORMAT_TEXT} from "@/utils/constants";

import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import {DataTable} from "mantine-datatable";
import {notifications} from "@mantine/notifications";
import {ActionIcon, Group, TextInput, Stack, Title, Box, Flex, Button} from "@mantine/core";

import StatusText from "@/components/status-text/StatusText.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {MagnifyingGlassIcon} from "@/assets/icons/index.js";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import styles from "./Streams.module.css";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.Initialize(true);
  }, 500);

  const records = Object.values(streamStore.streams || {})
    .filter(record => {
      return (
        !debouncedFilter ||
        record.title?.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        record.objectId?.toLowerCase().includes(debouncedFilter.toLowerCase())
      );
    })
    .sort(SortTable({sortStatus}));

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
              <Stack gap={0}>
                <Link to={`/streams/${record.objectId || record.slug}`} className={styles.tableLink}>
                  <Title order={3} lineClamp={1} title={record.title || record.slug}>
                    {record.title || record.slug}
                  </Title>
                </Link>
                <Title order={6} c="elv-gray.6">
                  {record.objectId}
                </Title>
              </Stack>
            )},
            { accessor: "originUrl", title: "URL", render: record => <BasicTableRowText title={SanitizeUrl({url: record.originUrl})}>{SanitizeUrl({url: record.originUrl})}</BasicTableRowText> },
            { accessor: "format", title: "Format", render: record => <BasicTableRowText>{FORMAT_TEXT[record.format]}</BasicTableRowText> },
            { accessor: "video", title: "Video", render: record => <BasicTableRowText>{CODEC_TEXT[record.codecName]} {VideoBitrateReadable(record.videoBitrate)}</BasicTableRowText> },
            { accessor: "audioStreams", title: "Audio", render: record => <BasicTableRowText>{record.audioStreamCount ? `${record.audioStreamCount} ${record.audioStreamCount > 1 ? "streams" : "stream"}` : ""}</BasicTableRowText> },
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
                  <Group gap={7} justify="right">
                    {
                      ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE].includes(record.status) ? null :
                        <ActionIcon
                          title="Check Stream"
                          variant="subtle"
                          color="gray.6"
                          onClick={async () => {
                            const url = await streamStore.client.ContentObjectMetadata({
                              libraryId: await streamStore.client.ContentObjectLibraryId({objectId: record.objectId}),
                              objectId: record.objectId,
                              metadataSubtree: "live_recording_config/url"
                            });

                            modalStore.SetModal({
                              data: {
                                objectId: record.objectId,
                                name: record.title,
                                loadingText: `Please send your stream to ${SanitizeUrl({url}) || "the URL you specified"}.`
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
                          onClick={() => {
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
                          onClick={() => {
                            modalStore.SetModal({
                              data: {
                                objectId: record.objectId,
                                name: record.title
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
                            component={Link}
                            to={`/streams/${record.objectId}/preview`}
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
                            onClick={() => {
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
                        onClick={() => editStore.client.SendMessage({
                          options: {
                            operation: "OpenLink",
                            libraryId: record.libraryId,
                            objectId: record.objectId
                          },
                          noResponse: true
                        })}
                      >
                        <IconExternalLink />
                      </ActionIcon>
                    }
                    <ActionIcon
                      title="Delete Stream"
                      variant="subtle"
                      color="gray.6"
                      disabled={StreamIsActive(record.status)}
                      onClick={() => {
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
