import {useState} from "react";
import {observer} from "mobx-react-lite";
import {useNavigate} from "react-router-dom";
import {dataStore, modalStore, streamStore} from "@/stores";
import {SortTable} from "@/utils/helpers";
import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import Actions from "@/components/table/actions/Actions.jsx";
import BatchActions from "@/components/table/batch-actions/BatchActions.jsx";
import {notifications} from "@mantine/notifications";

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

  const refreshSelectedStatus = () =>
    Promise.all(selectedRecords.map(r => streamStore.CheckStatus({objectId: r.objectId, slug: r.slug, update: true})));

  const openBatchModal = (op) => {
    modalStore.SetBatchModal({
      op,
      records: selectedRecords.map(r => streamStore.streams[r.slug] ?? r),
      notifications,
      Callback: refreshSelectedStatus
    });
  };

  const batchActions = [
    {
      label: "Start",
      id: "start-batch-action",
      onClick: () => openBatchModal("START")
    },
    {
      label: "Stop",
      id: "stop-batch-action",
      onClick: () => openBatchModal("STOP")
    },
    {
      label: "Delete",
      id: "delete-batch-action",
      onClick: () => modalStore.SetBatchModal({
        op: "DELETE",
        records: selectedRecords.map(r => streamStore.streams[r.slug] ?? r),
        notifications,
        Callback: () => setSelectedRecords([])
      })
    },
    {
      label: "Duplicate",
      id: "duplicate-batch-action"
    },
  ];

  return (
    <PageContainer
      title="Streams"
    >
      <Actions
        actions={[
          {label: "Create", id: "create-action", variant: "filled", onClick: () => navigate("/streams/create")},
          {label: "Refresh", id: "refresh-action", variant: "outline", onClick: DebouncedRefresh}
        ]}
      />
      <BatchActions
        selectedRecords={selectedRecords}
        SelectAll={() => setSelectedRecords(records)}
        ClearSelection={() => setSelectedRecords([])}
        actions={batchActions}
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
