import {ActionIcon, Box, Button, Group, Title, Tooltip} from "@mantine/core";
import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {toJS} from "mobx";
import {notifications} from "@mantine/notifications";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import TagModal from "@/pages/settings/declared-tags/TagModal.jsx";
import {IconPencil, IconTrash} from "@tabler/icons-react";
import {DataTable} from "mantine-datatable";
import sharedStyles from "@/assets/shared.module.css";
import {dataStore} from "@/stores/index.ts";

const DeclaredTags = observer(() => {
  const [pendingDeleteTag, setPendingDeleteTag] = useState(null);
  const [editTag, setEditTag] = useState(null);
  const [addingTag, setAddingTag] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dataStore.LoadDeclaredTags();
  }, []);

  const HandleRefresh = async() => {
    try {
      setRefreshing(true);
      await dataStore.LoadDeclaredTags();
    } finally {
      setRefreshing(false);
    }
  };

  const Save = async({tags, commitMessage, title, message}) => {
    try {
      setSaving(true);
      await dataStore.SaveDeclaredTags({tags, commitMessage});
      notifications.show({title, message});
    } finally {
      setSaving(false);
    }
  };

  const currentTags = () => toJS(dataStore.declaredTags) ?? [];
  const records = currentTags().map(name => ({name}));

  return (
    <>
      <Box w="100%" mb={20}>
        <Group>
          <Group ml="auto" gap={8}>
            <Button
              variant="filled"
              onClick={() => setAddingTag(true)}
              disabled={saving}
            >
              Add Tag
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
          idAccessor="name"
          highlightOnHover
          styles={{header: {color: "var(--mantine-color-elv-gray-9)"}}}
          records={records}
          fetching={refreshing || !dataStore.loadedDeclaredTags}
          minHeight={records.length === 0 ? 130 : 75}
          rowStyle={() => ({height: "50px"})}
          columns={[
            {
              accessor: "name",
              render: (record) => (
                <Title order={3} lineClamp={1} title={record.name} style={{wordBreak: "break-all"}}>
                  {record.name}
                </Title>
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
                      onClick={() => setEditTag(record.name)}
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
                      onClick={() => {
                        setPendingDeleteTag(record.name);
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
        title="Delete Tag Confirmation"
        message="Are you sure you want to delete this tag?"
        detailData={{
          nameKey: "Tag Name:",
          name: pendingDeleteTag
        }}
        confirmText="Delete Tag"
        danger
        show={showModal}
        CloseCallback={() => setShowModal(false)}
        ConfirmCallback={async() => {
          await Save({
            tags: currentTags().filter(tag => tag !== pendingDeleteTag),
            commitMessage: "Delete declared tag",
            title: "Tag deleted",
            message: "Declared tag successfully deleted"
          });
          setPendingDeleteTag(null);
        }}
      />
      <TagModal
        opened={editTag !== null}
        tag={editTag}
        existingTags={currentTags().filter(tag => tag !== editTag)}
        title="Edit Tag"
        onClose={() => setEditTag(null)}
        onSave={(name) => Save({
          tags: currentTags().map(tag => tag === editTag ? name : tag),
          commitMessage: "Update declared tag",
          title: "Tag updated",
          message: "Declared tag successfully updated"
        })}
      />
      <TagModal
        opened={addingTag}
        tag={null}
        existingTags={currentTags()}
        title="Add Tag"
        onClose={() => setAddingTag(false)}
        onSave={(name) => Save({
          tags: [...currentTags(), name],
          commitMessage: "Add declared tag",
          title: "Tag added",
          message: "Declared tag successfully added"
        })}
      />
    </>
  );
});

export default DeclaredTags;
