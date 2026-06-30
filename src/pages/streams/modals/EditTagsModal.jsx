import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Button, Flex, Modal, Pill, Stack, TagsInput, Text, Title} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {streamEditStore, streamStore} from "@/stores/index.ts";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import styles from "@/pages/outputs/modals/modals.module.css";
import pillStyles from "./EditTagsModal.module.css";

const EditTagsModal = observer(({opened, onClose, records=[]}) => {
  const [initialSavedTags, setInitialSavedTags] = useState([]);
  const [savedTags, setSavedTags] = useState([]);
  const [newTags, setNewTags] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if(opened) {
      const unionTags = Array.from(new Set(records.flatMap(r => r.tags || [])));
      setInitialSavedTags(unionTags);
      setSavedTags(unionTags);
      setNewTags([]);
    }
  }, [opened]);

  const allCurrentTags = Array.from(new Set([...savedTags, ...newTags]));

  const HandleSave = async() => {
    try {
      setIsSaving(true);
      const removedTags = initialSavedTags.filter(t => !savedTags.includes(t));

      const streams = records.map(record => {
        const filteredTags = (record.tags || []).filter(t => !removedTags.includes(t));

        return {
          objectId: record.objectId,
          slug: record.slug,
          tags: Array.from(new Set([
            ...filteredTags,
            ...newTags
          ]))
        };
      });

      await streamEditStore.UpdateStreamTagsBatch({streams});

      notifications.show({
        title: "Tags updated",
        message: <NotificationMessage>Tags saved successfully</NotificationMessage>
      });
      onClose();
    } catch {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Failed to update tags"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600} mb={4}>Edit Tags</Title>
          <Text fz="0.875rem" c="elv-gray.9" fw={500}>Update tags applied to the selected items.</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      centered
      closeOnClickOutside={false}
    >
      <Text mb={2} fz="1rem" c="elv-black.3" fw={600}>Current Tags</Text>
      {savedTags.length > 0 && (
        <Text fz="0.875rem" fw={400} c="elv-gray.6" mb={12}>Tags found across the selected items. Removing a tag will remove it from all applicable items.</Text>
      )}
      {savedTags.length === 0 ? (
        <Text className={pillStyles.emptyTags} mb={20}>No tags applied.</Text>
      ) : (
        <Flex gap={8} wrap="wrap" mb={20}>
          {savedTags.map(tag => (
            <Pill
              key={tag}
              size="md"
              withRemoveButton
              classNames={{
                root: pillStyles.pill,
                label: pillStyles.pillLabel,
                remove: pillStyles.pillRemove
              }}
              onRemove={() => setSavedTags(prev => prev.filter(t => t !== tag))}
            >
              {tag}
            </Pill>
          ))}
        </Flex>
      )}

      <Text mb={2} fz="1rem" c="elv-black.3" fw={600}>Add New Tags</Text>
      <TagsInput
        description="Add tags to organize and quickly find streams. New tags will be applied to all selected items."
        styles={{description: {fontSize: "0.875rem"}}}
        placeholder="Type and press Enter to add a tag"
        data={streamStore.allTags.filter(t => !allCurrentTags.includes(t))}
        value={newTags}
        onChange={setNewTags}
        mb={24}
        clearable
      />

      <Flex direction="row" align="center" justify="flex-end" gap={8}>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button onClick={HandleSave} loading={isSaving}>Save</Button>
      </Flex>
    </Modal>
  );
});

export default EditTagsModal;
