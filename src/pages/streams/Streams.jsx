import {useState} from "react";
import {observer} from "mobx-react-lite";
import {useNavigate} from "react-router-dom";
import {dataStore, streamStore} from "@/stores";
import {SortTable} from "@/utils/helpers";
import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import Actions from "@/components/table/actions/Actions.jsx";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [selectedRecords, setSelectedRecords] = useState([]);
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
      <Actions
        mb={16}
        actions={[
          {label: "Create", id: "create-action", variant: "filled", onClick: () => navigate("/streams/create")},
          {label: "Refresh", id: "refresh-action", variant: "outline", onClick: DebouncedRefresh}
        ]}
      />
      <StreamsTable
        records={records}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        selectedRecords={selectedRecords}
        onSelectedRecordsChange={setSelectedRecords}
        fetching={!dataStore.loaded}
        onNameClick={objectId => navigate(`/streams/${objectId}`)}
      />
    </PageContainer>
  );
});

export default Streams;
