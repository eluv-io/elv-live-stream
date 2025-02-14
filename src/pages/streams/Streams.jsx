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

import Modal from "@/components/Modal.jsx";
import {dataStore, editStore, streamStore} from "@/stores";
import {SanitizeUrl, SortTable, VideoBitrateReadable, StreamIsActive} from "@/utils/helpers";
import {STATUS_MAP} from "@/utils/constants";
import {CODEC_TEXT, FORMAT_TEXT} from "@/utils/constants";

import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import {DataTable} from "mantine-datatable";
import {Text, ActionIcon, Group, TextInput} from "@mantine/core";
import PageHeader, {StatusText} from "@/components/header/PageHeader";
import styles from "./Streams.module.css";

const StreamModal = observer(({
  open,
  onOpenChange,
  ConfirmCallback,
  title,
  description,
  loadingText
}) => {
  if(!open) { return null; }

  return (
    <Modal
      title={title}
      description={description}
      loadingText={loadingText}
      open={open}
      onOpenChange={onOpenChange}
      ConfirmCallback={ConfirmCallback}
    />
  );
});

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "display_title", direction: "asc"});
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);

  const ResetModal = () => {
    setModalData({
      showModal: false,
      title: "",
      description: "",
      objectId: "",
      ConfirmCallback: null
    });
  };

  const [modalData, setModalData] = useState({
    showModal: false,
    title: "",
    description: "",
    loadingText: "",
    objectId: "",
    ConfirmCallback: null,
    CloseCallback: null
  });

  const streamsCopy = Object.values(streamStore.streams || {});
  const records = Object.values(streamsCopy || {})
    .filter(record => {
      return (
        !debouncedFilter ||
        record.title.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        record.objectId.toLowerCase().includes(debouncedFilter.toLowerCase())
      );
    })
    .sort(SortTable({sortStatus}));

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.Initialize(true);
  }, 500);

  return (
    <div>
      <div className="streams">
        <PageHeader
          title="Streams"
          actions={[
            {
              label: "Refresh",
              variant: "outline",
              onClick: DebouncedRefresh
            }
          ]}
        />
        <TextInput
          maw={400}
          placeholder="Search by object name or ID"
          mb="md"
          value={filter}
          onChange={event => setFilter(event.target.value)}
        />
        <DataTable
          withTableBorder
          highlightOnHover
          idAccessor="objectId"
          minHeight={!records || records.length === 0 ? 150 : 75}
          fetching={dataStore.tenantId && !streamStore.streams}
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
            { accessor: "title", title: "Name", sortable: true, width: 300, render: record => (
              <div className="table__multi-line">
                <Link to={`/streams/${record.objectId || record.slug}`} className={styles.tableLink}>
                  <Text fw={600} lineClamp={1} title={record.display_title || record.slug}>
                    {record.display_title || record.slug}
                  </Text>
                </Link>
                <Text c="dimmed" fz="xs">{record.objectId}</Text>
              </div>
            )},
            { accessor: "originUrl", title: "URL", render: record => <Text title={SanitizeUrl({url: record.originUrl})}>{SanitizeUrl({url: record.originUrl})}</Text> },
            { accessor: "format", title: "Format", render: record => <Text>{FORMAT_TEXT[record.format]}</Text> },
            { accessor: "video", title: "Video", render: record => <Text>{CODEC_TEXT[record.codecName]} {VideoBitrateReadable(record.videoBitrate)}</Text> },
            { accessor: "audioStreams", title: "Audio", render: record => <Text>{record.audioStreamCount ? `${record.audioStreamCount} ${record.audioStreamCount > 1 ? "streams" : "stream"}` : ""}</Text> },
            {
              accessor: "status",
              title: "Status",
              sortable: true,
              width: 150,
              render: record => !record.status ? null :
                <StatusText
                  status={record.status}
                  quality={record.quality}
                />
            },
            {
              accessor: "actions",
              title: "",
              width: 150,
              render: record => {
                return (
                  <Group gap="xxs" justify="right">
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

                            setModalData({
                              objectId: record.objectId,
                              showModal: true,
                              title: "Check Stream",
                              description: record.status === STATUS_MAP.INACTIVE ? "Are you sure you want to check the stream? This will override your saved configuration." : "Are you sure you want to check the stream?",
                              loadingText: `Please send your stream to ${SanitizeUrl({url}) || "the URL you specified"}.`,
                              ConfirmCallback: async () => {
                                try {
                                  await streamStore.ConfigureStream({
                                    objectId: record.objectId,
                                    slug: record.slug
                                  });
                                } catch(error) {
                                  // eslint-disable-next-line no-console
                                  console.error("Configure Modal - Failed to check stream", error);
                                  throw error;
                                }
                              },
                              CloseCallback: () => ResetModal()
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
                            setModalData({
                              objectId: record.objectId,
                              showModal: true,
                              title: "Start Stream",
                              description: "Are you sure you want to start the stream?",
                              ConfirmCallback: async () => {
                                await streamStore.StartStream({slug: record.slug});
                              },
                              CloseCallback: () => ResetModal()
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
                            setModalData({
                              objectId: record.objectId,
                              showModal: true,
                              title: "Deactivate Stream",
                              description: "Are you sure you want to deactivate the stream?",
                              ConfirmCallback: async () => {
                                await streamStore.DeactivateStream({
                                  slug: record.slug,
                                  objectId: record.objectId
                                });
                              },
                              CloseCallback: () => ResetModal()
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
                              setModalData({
                                objectId: record.objectId,
                                showModal: true,
                                title: "Stop Stream",
                                description: "Are you sure you want to stop the stream?",
                                ConfirmCallback: async () => {
                                  await streamStore.OperateLRO({
                                    objectId: record.objectId,
                                    slug: record.slug,
                                    operation: "STOP"
                                  });
                                },
                                CloseCallback: () => ResetModal()
                              });
                            }}
                          >
                            <IconPlayerStop />
                          </ActionIcon>
                        </>
                    }
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
                    <ActionIcon
                      title="Delete Stream"
                      variant="subtle"
                      color="gray.6"
                      disabled={StreamIsActive(record.status)}
                      onClick={() => {
                        setModalData({
                          objectId: record.objectId,
                          showModal: true,
                          title: "Delete Stream",
                          description: "Are you sure you want to delete the stream? This action cannot be undone.",
                          ConfirmCallback: async () => {
                            await editStore.DeleteStream({objectId: record.objectId});
                          },
                          CloseCallback: () => ResetModal()
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
      </div>
      <StreamModal
        title={modalData.title}
        description={modalData.description}
        loadingText={modalData.loadingText}
        open={modalData.showModal}
        onOpenChange={modalData.CloseCallback}
        ConfirmCallback={modalData.ConfirmCallback}
      />
    </div>
  );
});

export default Streams;
