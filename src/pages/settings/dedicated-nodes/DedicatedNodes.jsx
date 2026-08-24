import {ActionIcon, Box, Button, Group, Stack, Title, Tooltip} from "@mantine/core";
import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {toJS} from "mobx";
import {notifications} from "@mantine/notifications";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NodeModal from "@/pages/settings/dedicated-nodes/NodeModal.jsx";
import {IconPencil, IconTrash} from "@tabler/icons-react";
import {DataTable} from "mantine-datatable";
import sharedStyles from "@/assets/shared.module.css";
import {dataStore} from "@/stores/index.ts";

const DedicatedNodes = observer(() => {
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [editNodeId, setEditNodeId] = useState(null);
  const [addingNode, setAddingNode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dataStore.LoadDedicatedNodes();
  }, []);

  const HandleRefresh = async() => {
    try {
      setRefreshing(true);
      await dataStore.LoadDedicatedNodes();
    } finally {
      setRefreshing(false);
    }
  };

  const HandleAddNode = () => {
    setAddingNode(true);
  };

  const HandleEditNode = (record) => {
    setEditNodeId(record.value);
  };

  const HandleDeleteNode = async(id) => {
    try {
      setSaving(true);

      // eslint-disable-next-line no-unused-vars
      const {[id]: _removed, ...remainingNodes} = toJS(dataStore.dedicatedNodes) ?? {};

      await dataStore.SaveDedicatedNodes({nodes: remainingNodes, commitMessage: "Delete dedicated node"});

      notifications.show({
        title: "Node deleted",
        message: "Dedicated node successfully deleted"
      });
    } finally {
      setSaving(false);
    }
  };

  const records = dataStore.dedicatedNodesList;

  return (
    <>
      <Box w="100%" mb={20}>
        <Group>
          <SectionTitle>Dedicated Nodes</SectionTitle>
          <Group ml="auto" gap={8}>
            <Button
              variant="filled"
              onClick={HandleAddNode}
              disabled={saving}
            >
              Add Node
            </Button>
            <Button
              variant="outline"
              onClick={HandleRefresh}
              disabled={refreshing || saving}
            >
              Refresh
            </Button>
          </Group>
        </Group>
      </Box>
      <Box className={sharedStyles.tableWrapper}>
        <DataTable
          idAccessor="value"
          highlightOnHover
          styles={{header: {color: "var(--mantine-color-elv-gray-9)"}}}
          records={records}
          fetching={refreshing || !dataStore.loadedDedicatedNodes}
          minHeight={(!records || records.length === 0) ? 130 : 75}
          rowStyle={() => ({height: "50px"})}
          columns={[
            {
              accessor: "name",
              render: (record) => (
                <Stack gap={0} maw="100%">
                  <Title order={3} lineClamp={1} title={record.label} style={{wordBreak: "break-all"}}>
                    {record.label}
                  </Title>
                  <Title order={6} c="elv-gray.6" lineClamp={1}>
                    {record.value}
                  </Title>
                </Stack>
              )
            },
            {
              accessor: "",
              textAlign: "right",
              render: (record) => (
                <Group justify="flex-end" gap={12}>
                  <Tooltip label="Edit" withArrow>
                    <ActionIcon
                      size={22}
                      variant="transparent"
                      color="elv-gray.6"
                      onClick={() => HandleEditNode(record)}
                      disabled={saving}
                    >
                      <IconPencil />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete" withArrow>
                    <ActionIcon
                      size={22}
                      variant="transparent"
                      color="elv-gray.6"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteItem({id: record.value, name: record.label});
                        setShowModal(true);
                      }}
                      disabled={saving}
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
        title="Delete Dedicated Node Confirmation"
        message="Are you sure you want to delete this dedicated node?"
        detailData={{
          nameKey: "Node Name:",
          name: pendingDeleteItem?.name,
          idKey: "Node ID:",
          id: pendingDeleteItem?.id
        }}
        confirmText="Delete Node"
        danger
        show={showModal}
        CloseCallback={() => setShowModal(false)}
        ConfirmCallback={async() => {
          await HandleDeleteNode(pendingDeleteItem.id);
          setPendingDeleteItem(null);
        }}
      />
      <NodeModal
        opened={!!editNodeId}
        nodeId={editNodeId}
        node={editNodeId ? dataStore.dedicatedNodes?.[editNodeId] : null}
        existingNodeIds={Object.keys(dataStore.dedicatedNodes ?? {}).filter(key => key !== editNodeId)}
        title="Edit Dedicated Node"
        description="Update the name, ID, and URLs for this dedicated node."
        onClose={() => setEditNodeId(null)}
        onSave={async(newId, updatedNode) => {
          try {
            setSaving(true);

            // eslint-disable-next-line no-unused-vars
            const {[editNodeId]: _removed, ...remainingNodes} = toJS(dataStore.dedicatedNodes) ?? {};

            await dataStore.SaveDedicatedNodes({
              nodes: {...remainingNodes, [newId]: updatedNode},
              commitMessage: "Update dedicated node"
            });

            notifications.show({
              title: "Node updated",
              message: "Dedicated node successfully updated"
            });
          } finally {
            setSaving(false);
          }
        }}
      />
      <NodeModal
        opened={addingNode}
        nodeId={null}
        node={null}
        existingNodeIds={Object.keys(dataStore.dedicatedNodes ?? {})}
        title="Add Dedicated Node"
        onClose={() => setAddingNode(false)}
        onSave={async(newId, newNode) => {
          try {
            setSaving(true);

            await dataStore.SaveDedicatedNodes({
              nodes: {
                ...toJS(dataStore.dedicatedNodes),
                [newId]: newNode
              },
              commitMessage: "Add dedicated node"
            });

            notifications.show({
              title: "Node added",
              message: "Dedicated node successfully added"
            });
          } finally {
            setSaving(false);
          }
        }}
      />
    </>
  );
});

export default DedicatedNodes;
