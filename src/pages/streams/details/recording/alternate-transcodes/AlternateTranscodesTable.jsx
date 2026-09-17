import {useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Button, Group, Tooltip} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {IconPencil, IconPlus, IconTrash} from "@tabler/icons-react";
import {notifications} from "@mantine/notifications";
import {dataStore, streamEditStore} from "@/stores/index.ts";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.ts";
import {AudioBitrateReadable} from "@/utils/formatters.ts";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import AlternateTranscodeModal from "@/pages/streams/details/recording/alternate-transcodes/AlternateTranscodeModal.jsx";
import sharedStyles from "@/assets/shared.module.css";

// Resolves a node id to its name via dataStore.dedicatedNodesList; falls
// back to the raw id when unregistered.
const GeoNodeLabel = (record) => {
  if(record.node) {
    return dataStore.dedicatedNodesList.find(n => n.value === record.node)?.label || record.node;
  }

  return FABRIC_NODE_REGIONS.find(g => g.value === record.geo)?.label || record.geo || "-";
};

// Controlled component like AudioTracksTable.jsx, but each row action is an
// immediate fabric write, not a staged edit awaiting the panel's Save.
const AlternateTranscodesTable = observer(({records, onChange, disabled, parentObjectId, parentLibraryId, parentSlug}) => {
  const [editingTranscode, setEditingTranscode] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const HandleSave = async(values) => {
    setSaving(true);
    try {
      const record = values.id ?
        await streamEditStore.UpdateAlternateTranscode({objectId: values.id, ...values}) :
        await streamEditStore.CreateAlternateTranscode({parentObjectId, parentLibraryId, parentSlug, ...values});

      const exists = (records || []).some(r => r.id === record.id);
      onChange(exists ? records.map(r => r.id === record.id ? record : r) : [...(records || []), record]);
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
          Add alternate transcode
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
            {accessor: "name", title: "Name"},
            {accessor: "geoNode", title: "Geo/Node", render: GeoNodeLabel},
            {accessor: "resolution", title: "Resolution", render: record => record.resolution || "-"},
            {accessor: "streamBitrate", title: "Bitrate", render: record => AudioBitrateReadable(Number(record.streamBitrate)) || "-"},
            {
              accessor: "actions",
              title: "",
              textAlign: "right",
              render: (record) => (
                <Group justify="flex-end" gap={12} wrap="nowrap">
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
        detailData={{nameKey: "Name:", name: pendingDeleteItem?.name}}
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
