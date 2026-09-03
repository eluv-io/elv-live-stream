import {observer} from "mobx-react-lite";
import {Box, Button, Flex, Modal, Stack, Text, TextInput, Title} from "@mantine/core";
import styles from "./modals.module.css";
import {SortTable} from "@/utils/helpers.ts";
import {useEffect, useState} from "react";
import {streamStore} from "@/stores/index.ts";
import {IconSearch} from "@tabler/icons-react";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import {useDebouncedValue} from "@mantine/hooks";

// Picks an input failover stream for an output. Unlike MapToStreamModal (which
// maps the primary and writes immediately), this returns the selection via
// onSelect - the value is held in the output form and persisted on Save.
const SelectFailoverStreamModal = observer(({show, onCloseModal, onSelect, currentStreamId, primaryStreamId}) => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);
  const [selectedRecords, setSelectedRecords] = useState([]);

  useEffect(() => {
    if(show) { streamStore.LoadAllStreams(); }
  }, [show]);

  // Same eligibility as primary mapping, minus the output's own primary stream.
  const CanSelectStream = record =>
    !!record.inputCfg &&
    !!record.packaging?.includes("ts") &&
    record.objectId !== primaryStreamId;

  const records = Object.values(streamStore.allStreams || {})
    .filter(record => (
      record.title?.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
      record.objectId?.toLowerCase().includes(debouncedFilter.toLowerCase())
    ))
    .sort(SortTable({sortStatus}));

  const HandleSubmit = () => {
    const record = selectedRecords[0]?.record;
    if(!record) { return; }

    onSelect({objectId: record.objectId, title: record.title});
    onCloseModal();
    setSelectedRecords([]);
  };

  return (
    <Modal
      opened={show}
      onClose={() => { onCloseModal(); setSelectedRecords([]); }}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>Select Failover Stream</Title>
          <Text fz="0.875rem" c="elv-gray.8">Select the stream to fail over to if the primary input disconnects (TS streams only; the primary stream can&apos;t be selected).</Text>
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

        <Box style={{flex: 1, minHeight: 0}}>
          <StreamsTable
            records={records}
            fetching={streamStore.loadingAllStreams && records.length === 0}
            isRecordSelectable={CanSelectStream}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            onRowClick={record => { if(CanSelectStream(record.record)) { setSelectedRecords([record]); } }}
            rowStyle={record => {
              if(!CanSelectStream(record)) { return {opacity: 0.4, cursor: "not-allowed"}; }
              const selectedId = selectedRecords?.[0]?.record?.objectId ?? currentStreamId;
              if(selectedId === record.objectId) { return {backgroundColor: "var(--mantine-color-elv-blue-0)"}; }
            }}
            showActions={false}
            maxHeight="100%"
          />
        </Box>
        <Flex direction="row" align="center" pt="1.5rem" justify="flex-end">
          <Button onClick={HandleSubmit} disabled={selectedRecords.length === 0}>Select</Button>
        </Flex>
      </Stack>
    </Modal>
  );
});

export default SelectFailoverStreamModal;
