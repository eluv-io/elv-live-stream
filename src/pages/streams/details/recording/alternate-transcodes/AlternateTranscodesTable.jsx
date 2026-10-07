import {useCallback, useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Button, Divider, Group, Stack, Text, Title, Tooltip} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {IconPencil, IconPlayerPlay, IconPlayerStop, IconPlus, IconTrash} from "@tabler/icons-react";
import {notifications} from "@mantine/notifications";
import {dataStore, modalStore, streamEditStore, streamStore} from "@/stores/index.ts";
import {FABRIC_NODE_REGIONS, STATUS_MAP} from "@/utils/constants.ts";
import {VideoBitrateReadable} from "@/utils/formatters.ts";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import AlternateTranscodeModal from "@/pages/streams/details/recording/alternate-transcodes/AlternateTranscodeModal.jsx";
import sharedStyles from "@/assets/shared.module.css";

// Resolves a node id to its name via dataStore.dedicatedNodesList; falls
// back to the raw id when unregistered.
const GeoNodeLabel = (record) => {
  if(record.node) {
    return dataStore.dedicatedNodesList.find(n => n.value === record.node)?.label || record.node;
  }

  if(record.geo) {
    const geoLabel = FABRIC_NODE_REGIONS.find(g => g.value === record.geo)?.label || record.geo;
    const nodeLabel = record.resolvedNodeId &&
      (dataStore.dedicatedNodesList.find(n => n.value === record.resolvedNodeId)?.label || record.resolvedNodeId);
    return nodeLabel ? `${geoLabel} / ${nodeLabel}` : geoLabel;
  }

  return "-";
};

// "<resolution> @ <bitrate>", omitting whichever part is missing.
const VideoLabel = (record) => {
  const bitrate = VideoBitrateReadable(Number(record.videoBitrate));
  return [record.resolution, bitrate].filter(Boolean).join(" @ ") || "-";
};

// Controlled component like AudioTracksTable.jsx, but each row action is an
// immediate fabric write, not a staged edit awaiting the panel's Save.
const AlternateTranscodesTable = observer(({records, onChange, disabled, parentObjectId, parentLibraryId, parentSlug}) => {
  const [editingTranscode, setEditingTranscode] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [startingIds, setStartingIds] = useState([]);

  const idsKey = (records || []).map(r => r.id).join(",");

  const LoadStatuses = useCallback(() => {
    if(!idsKey) { return Promise.resolve(); }

    return streamStore.StreamStatuses(idsKey.split(","))
      .then(result => setStatuses(result));
  }, [idsKey]);

  useEffect(() => {
    LoadStatuses();
  }, [LoadStatuses]);

  // Slug is omitted: alternate transcodes aren't in the streams map.
  const ConfirmStreamOp = (record, op) => {
    modalStore.SetModal({
      data: {objectId: record.id, name: record.name},
      op,
      slug: "",
      Callback: LoadStatuses,
      notifications
    });
  };

  const StartNewTranscode = async(id) => {
    setStartingIds(ids => [...ids, id]);

    try {
      await streamStore.StartStream({objectId: id});
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: `Unable to start alternate transcode: ${error?.message || error}`
      });
    } finally {
      const result = await streamStore.StreamStatuses([id]);
      setStatuses(prev => ({...prev, ...result}));
      setStartingIds(ids => ids.filter(startingId => startingId !== id));
    }
  };

  const HandleSave = async(values) => {
    setSaving(true);
    try {
      const record = values.id ?
        await streamEditStore.UpdateAlternateTranscode({objectId: values.id, ...values}) :
        await streamEditStore.CreateAlternateTranscode({parentObjectId, parentLibraryId, parentSlug, ...values});

      const exists = (records || []).some(r => r.id === record.id);
      onChange(exists ? records.map(r => r.id === record.id ? record : r) : [...(records || []), record]);

      if(!exists) { StartNewTranscode(record.id); }
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: `Unable to save alternate transcode: ${error?.message || error}`
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const HandleDelete = async(id) => {
    try {
      await streamEditStore.RemoveAlternateTranscode({parentObjectId, parentLibraryId, parentSlug, id});
      onChange((records || []).filter(r => r.id !== id));
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: `Unable to remove alternate transcode: ${error?.message || error}`
      });
    }
  };

  return (
    <Box>
      <Group justify="flex-end" mb={12}>
        <Button
          variant="outline"
          leftSection={<IconPlus size={16} />}
          onClick={() => setAdding(true)}
          disabled={disabled || saving}
        >
          Add Alternate Transcode
        </Button>
      </Group>
      <Box className={sharedStyles.tableWrapper}>
        <DataTable
          classNames={{header: sharedStyles.tableHeader}}
          idAccessor="id"
          noRecordsText="No alternate transcodes configured"
          minHeight={(!records || records.length === 0) ? 130 : 75}
          records={records || []}
          columns={[
            {
              accessor: "name",
              title: "Name",
              render: record => (
                <Stack gap={0} maw="100%">
                  <Title order={3} lineClamp={1} title={record.name} style={{wordBreak: "break-all"}}>
                    {record.name}
                  </Title>
                  <Group wrap="nowrap" gap={6}>
                    <StatusIndicator
                      status={startingIds.includes(record.id) ? STATUS_MAP.STARTING : statuses[record.id]?.status}
                      size="xs"
                      fw={400}
                      c="elv-gray.6"
                      fz="0.75rem"
                    />
                    <Box h={10}>
                      <Divider orientation="vertical" c="elv-gray.6" size="sm" h="100%" />
                    </Box>
                    <Text fz="0.75rem" fw={400} c="elv-gray.6" lineClamp={1}>{record.id}</Text>
                  </Group>
                </Stack>
              )
            },
            {accessor: "geoNode", title: "Geo/Node", render: GeoNodeLabel},
            {accessor: "streamBitrate", title: "Stream Bitrate", render: record => VideoBitrateReadable(Number(record.streamBitrate)) || "-"},
            {accessor: "video", title: "Video", render: VideoLabel},
            {
              accessor: "actions",
              title: "",
              textAlign: "right",
              render: (record) => (
                <Group justify="flex-end" gap={12} wrap="nowrap">
                  {
                    [STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(statuses[record.id]?.status) ? (
                      <Tooltip label="Start" withArrow>
                        <ActionIcon
                          size={22}
                          variant="transparent"
                          color="elv-gray.6"
                          disabled={disabled || saving || startingIds.includes(record.id)}
                          onClick={() => ConfirmStreamOp(record, "START")}
                        >
                          <IconPlayerPlay />
                        </ActionIcon>
                      </Tooltip>
                    ) : [STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(statuses[record.id]?.status) ? (
                      <Tooltip label="Stop" withArrow>
                        <ActionIcon
                          size={22}
                          variant="transparent"
                          color="elv-gray.6"
                          disabled={disabled || saving}
                          onClick={() => ConfirmStreamOp(record, "STOP")}
                        >
                          <IconPlayerStop />
                        </ActionIcon>
                      </Tooltip>
                    ) : null
                  }
                  <Tooltip label="Edit" withArrow>
                    <ActionIcon
                      size={22}
                      variant="transparent"
                      color="elv-gray.6"
                      disabled={disabled || saving}
                      onClick={() => setEditingTranscode(record)}
                    >
                      <IconPencil />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete" withArrow>
                    <ActionIcon
                      size={22}
                      variant="transparent"
                      color="elv-gray.6"
                      disabled={disabled || saving}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteItem(record);
                        setShowDeleteModal(true);
                      }}
                    >
                      <IconTrash />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )
            }
          ]}
        />
      </Box>

      <ConfirmModal
        title="Delete Alternate Transcode Confirmation"
        message="Are you sure you want to delete this alternate transcode?"
        detailData={{
          nameKey: "Stream Name:",
          name: pendingDeleteItem?.name,
          idKey: "Stream ID:",
          id: pendingDeleteItem?.id
        }}
        confirmText="Delete"
        danger
        show={showDeleteModal}
        CloseCallback={() => setShowDeleteModal(false)}
        ConfirmCallback={async() => {
          await HandleDelete(pendingDeleteItem.id);
          setPendingDeleteItem(null);
        }}
      />

      <AlternateTranscodeModal
        opened={adding}
        transcode={null}
        onClose={() => setAdding(false)}
        onSave={HandleSave}
      />
      <AlternateTranscodeModal
        opened={!!editingTranscode}
        transcode={editingTranscode}
        onClose={() => setEditingTranscode(null)}
        onSave={HandleSave}
      />
    </Box>
  );
});

export default AlternateTranscodesTable;
