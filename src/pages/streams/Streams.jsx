import {useState} from "react";
import {observer} from "mobx-react-lite";
import {useNavigate} from "react-router-dom";
import {IconSearch} from "@tabler/icons-react";
import {dataStore, streamStore} from "@/stores";
import {SortTable} from "@/utils/helpers";
import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import {TextInput, Flex, Button, Group} from "@mantine/core";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import styles from "./Streams.module.css";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [debouncedFilter] = useDebouncedValue(streamStore.streamFilter, 200);
  const navigate = useNavigate();

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.Initialize(true);
  }, 500);

  const records = Object.values(streamStore.streams || {})
    .filter(record => {
      return (
        !debouncedFilter ||
        record.title?.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        record.objectId?.toLowerCase().includes(debouncedFilter.toLowerCase())
      );
    })
    .sort(SortTable({sortStatus}));

  return (
    <PageContainer
      title="Streams"
    >
      <Flex w="100%" align="center" mb={16}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<IconSearch width={15} height={15} />}
          value={streamStore.streamFilter}
          onChange={event => streamStore.SetStreamFilter({filter: event.target.value})}
        />
        <Group ml="auto" gap={8}>
          <Button
            variant="filled"
            onClick={() => navigate("/streams/create")}
          >
            Create
          </Button>
          <Button
            onClick={DebouncedRefresh}
            variant="outline"
            ml="auto"
          >
            Refresh
          </Button>
        </Group>
      </Flex>
      <StreamsTable
        records={records}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        fetching={!dataStore.loaded}
        onNameClick={objectId => navigate(`/streams/${objectId}`)}
      />
    </PageContainer>
  );
});

export default Streams;
