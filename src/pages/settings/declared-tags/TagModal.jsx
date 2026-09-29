import {useEffect, useState} from "react";
import {Button, Checkbox, Flex, Modal, Stack, Text, TextInput, Title} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import styles from "@/pages/outputs/modals/modals.module.css";

const TagModal = ({opened, tag, existingTags=[], streamCount=0, streamsLoading=false, title, onClose, onSave}) => {
  const [name, setName] = useState("");
  const [renameOnStreams, setRenameOnStreams] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if(opened) {
      setName(tag ?? "");
      setRenameOnStreams(false);
    }
  }, [opened, tag]);

  const trimmed = name.trim();
  const error = opened && existingTags.includes(trimmed) ? "This tag already exists" : null;

  const HandleSave = async() => {
    try {
      setIsSaving(true);
      await onSave(trimmed, renameOnStreams && trimmed !== tag);
      onClose();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save tag", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: error?.message || "Unable to save tag"
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
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>{title}</Title>
        </Stack>
      }
      padding="24px"
      radius="6px"
      classNames={{header: styles.modalHeader}}
      centered
      closeOnClickOutside={false}
    >
      <TextInput
        label="Name"
        placeholder="Enter tag name"
        value={name}
        onChange={event => setName(event.target.value)}
        error={error}
        mb={tag ? 16 : 24}
        data-autofocus
      />
      {
        opened && tag && !isSaving && (
          streamsLoading ?
            <Text c="elv-gray.6" mb={24}>Checking streams...</Text> :
            streamCount > 0 ?
              <Checkbox
                label={`Also rename on ${streamCount} ${streamCount === 1 ? "stream" : "streams"}`}
                checked={renameOnStreams}
                onChange={event => setRenameOnStreams(event.currentTarget.checked)}
                mb={24}
              /> :
              <Text c="elv-gray.6" mb={24}>No streams use this tag.</Text>
        )
      }
      <Flex direction="row" align="center" justify="flex-end" gap={8}>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button onClick={HandleSave} loading={isSaving} disabled={!trimmed || !!error}>Save</Button>
      </Flex>
    </Modal>
  );
};

export default TagModal;
