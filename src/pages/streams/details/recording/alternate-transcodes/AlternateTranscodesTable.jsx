import {useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Button, Group, Tooltip} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {IconPencil, IconPlus, IconTrash} from "@tabler/icons-react";
import {dataStore} from "@/stores/index.ts";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.ts";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import AlternateTranscodeModal from "@/pages/streams/details/recording/alternate-transcodes/AlternateTranscodeModal.jsx";
import sharedStyles from "@/assets/shared.module.css";

const GeoNodeLabel = (record) => {
  if(record.nodeType === "dedicated") {
    const label = dataStore.dedicatedNodesList.find(n => n.value === record.node)?.label || record.node;
    return `Dedicated • ${label || "-"}`;
  }

  const label = FABRIC_NODE_REGIONS.find(g => g.value === record.geo)?.label || record.geo;
  return `Public • ${label || "-"}`;
};

// Controlled component, same shape as AudioTracksTable.jsx - parent owns the
// array via the panel's form field and passes it down with an onChange.
const AlternateTranscodesTable = observer(({records, onChange, disabled}) => {
  const [editingTranscode, setEditingTranscode] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const HandleSave = (record) => {
    const exists = (records || []).some(r => r.id === record.id);
    onChange(exists ? records.map(r => r.id === record.id ? record : r) : [...(records || []), record]);
  };

  const HandleDelete = (id) => {
    onChange((records || []).filter(r => r.id !== id));
  };

  return (
    <Box>
      <Group justify="flex-end" mb={12}>
        <Button
          variant="outline"
          leftSection={<IconPlus size={16} />}
          onClick={() => setAdding(true)}
          disabled={disabled}
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
            {accessor: "streamBitrate", title: "Bitrate", render: record => record.streamBitrate || "-"},
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
                      disabled={disabled}
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
                      disabled={disabled}
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
          HandleDelete(pendingDeleteItem.id);
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
