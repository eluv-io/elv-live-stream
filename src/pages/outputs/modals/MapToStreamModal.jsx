import {observer} from "mobx-react-lite";
import {Box, Button, Flex, Modal, Stack, Text, TextInput, Title} from "@mantine/core";
import styles from "./modals.module.css";
import {SortTable} from "@/utils/helpers.js";
import {useState} from "react";
import {outputStore, streamBrowseStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import {IconSearch} from "@tabler/icons-react";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import {useDebouncedValue} from "@mantine/hooks";

const MapToStreamModal = observer(({show, onCloseModal, outputs}) => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const records = Object.values(streamBrowseStore.streams || {})
    .filter(record => (
      record.title?.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
      record.objectId?.toLowerCase().includes(debouncedFilter.toLowerCase())
    ))
    .sort(SortTable({sortStatus}));

  const HandleSubmit = async() => {
    try {
      setIsSaving(true);
      await outputStore.MapStreamBatch({
        outputs,
        streamObjectId: selectedRecords[0].record.objectId
      });

      notifications.show({
        title: "New stream mapped",
        message: <NotificationMessage>Successfully mapped stream to output</NotificationMessage>
      });

      onCloseModal();
      setSelectedRecords([]);
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to map stream to output", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to map stream to output"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={show}
      onClose={onCloseModal}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>Select Input Stream</Title>
          <Text fz="0.875rem" c="elv-gray.8">Select the stream you want to map to (TS stream only).</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="75%"
      styles={{body: {height: "70vh", display: "flex", flexDirection: "column"}}}
      classNames={{header: styles.modalHeader}}
      centered
      closeOnClickOutside={false}
    >
      <Stack style={{flex: 1, overflow: "hidden"}}>
        <Flex w="100%" align="center" mb={20}>
          <TextInput
            flex={2}
            maw={400}
            placeholder="Search by object name or ID"
            leftSection={<IconSearch width={15} height={15} />}
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
        </Flex>

        <Box style={{flex: 1, overflow: "auto", minHeight: 0}}>
          <StreamsTable
            records={records}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            onRowClick={record => setSelectedRecords([record])}
            rowStyle={record => selectedRecords?.[0]?.record?.objectId === record.objectId ? {backgroundColor: "var(--mantine-color-elv-blue-0)"} : undefined}
            showActions={false}
          />
        </Box>
        <Flex direction="row" align="center" pt="1.5rem" justify="flex-end">
          <Button onClick={HandleSubmit} loading={isSaving} disabled={isSaving}>Map</Button>
        </Flex>
      </Stack>
    </Modal>
  );
});

export default MapToStreamModal;
