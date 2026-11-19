import {useState} from "react";
import {observer} from "mobx-react-lite";
import {Button, Group, Modal, Tabs} from "@mantine/core";
import {streamStatusStore} from "@/stores/index.ts";
import {LogEntries} from "@/utils/stream/stream.ts";
import LogView from "@/components/log-view/LogView.jsx";

// Snapshot of the stream's live-status errors/warnings from the store; Refresh re-polls status.
const ErrorLogModal = observer(({opened, onClose, slug}) => {
  const [refreshing, setRefreshing] = useState(false);
  const stream = streamStatusStore.streams?.[slug];
  const errors = LogEntries(stream?.errors);
  const warnings = LogEntries(stream?.warnings);

  const HandleRefresh = async() => {
    if(!stream?.objectId) { return; }

    try {
      setRefreshing(true);
      await streamStatusStore.CheckStatus({objectId: stream.objectId, slug, update: true});
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Error Log for ${stream?.title || stream?.objectId || ""}`}
      size="lg"
      padding="24px"
      radius="6px"
      centered
    >
      <Tabs defaultValue="errors" keepMounted={false}>
        <Tabs.List mb={12}>
          <Tabs.Tab value="errors">Errors ({ errors.length })</Tabs.Tab>
          <Tabs.Tab value="warnings">Warnings ({ warnings.length })</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="errors">
          <LogView entries={errors} emptyText="No errors" />
        </Tabs.Panel>
        <Tabs.Panel value="warnings">
          <LogView entries={warnings} emptyText="No warnings" />
        </Tabs.Panel>
      </Tabs>
      <Group justify="flex-end" mt={24} gap={8}>
        <Button variant="outline" onClick={HandleRefresh} loading={refreshing}>Refresh</Button>
        <Button onClick={onClose}>Close</Button>
      </Group>
    </Modal>
  );
});

export default ErrorLogModal;
