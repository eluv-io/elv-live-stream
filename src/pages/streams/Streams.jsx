import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {useNavigate} from "react-router-dom";
import {useDisclosure} from "@mantine/hooks";
import DuplicateStreamModal from "@/pages/streams/modals/DuplicateStreamModal.jsx";
import EditTagsModal from "@/pages/streams/modals/EditTagsModal.jsx";
import {dataStore, modalStore, streamStore} from "@/stores/index.ts";
import {SortTable} from "@/utils/helpers.ts";
import {useDebouncedCallback} from "@mantine/hooks";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import Actions from "@/components/table/actions/Actions.jsx";
import TagFilterRow from "@/components/table/tag-filter-row/TagFilterRow.jsx";
import BatchActions from "@/components/table/batch-actions/BatchActions.jsx";
import {notifications} from "@mantine/notifications";
import {IconCopy, IconLabel, IconPlayerPlay, IconPlayerStop, IconTrash} from "@tabler/icons-react";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [showDuplicateModal, {open: openDuplicate, close: closeDuplicate}] = useDisclosure(false);
  const [showEditTagsModal, {open: openEditTags, close: closeEditTags}] = useDisclosure(false);
  const navigate = useNavigate();

  useEffect(() => {
    streamStore.SetTableTagFilter([]);
    if(!dataStore.streamsLoaded) {
      dataStore.LoadSiteStreams();
    }
  }, []);

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.LoadSiteStreams(true);
  }, 500);

  const records = streamStore.filteredStreams.slice().sort(SortTable({sortStatus}));

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
      icon: IconPlayerPlay,
      onClick: () => openBatchModal("START"),
      disabled: selectedRecords.length === 0
    },
    {
      label: "Stop",
      id: "stop-batch-action",
      icon: IconPlayerStop,
      onClick: () => openBatchModal("STOP"),
      disabled: selectedRecords.length === 0
    },
    {
      label: "Delete",
      id: "delete-batch-action",
      icon: IconTrash,
      onClick: () => modalStore.SetBatchModal({
        op: "DELETE",
        records: selectedRecords.map(r => streamStore.streams[r.slug] ?? r),
        notifications,
        Callback: () => setSelectedRecords([])
      }),
      disabled: selectedRecords.length === 0
    },
    {
      label: "Duplicate",
      id: "duplicate-batch-action",
      icon: IconCopy,
      onClick: openDuplicate,
      disabled: selectedRecords.length !== 1
    },
    {
      label: "Edit Tags",
      id: "edit-tags-batch-action",
      icon: IconLabel,
      onClick: openEditTags,
      disabled: selectedRecords.length === 0
    }
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
        searchValue={streamStore.tableFilter}
        onSearchChange={(event) => streamStore.SetTableFilter(event.target.value)}
        tagOptions={streamStore.allTags}
        tagFilter={streamStore.tableTagFilter}
        onTagFilterChange={(tags) => streamStore.SetTableTagFilter(tags)}
      />
      <TagFilterRow
        tags={streamStore.allTags}
        selectedTags={streamStore.tableTagFilter}
        onTagToggle={(tag) => {
          const current = streamStore.tableTagFilter;
          streamStore.SetTableTagFilter(
            current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
          );
        }}
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
        fetching={!dataStore.streamsLoaded}
        onNameClick={objectId => navigate(`/streams/${objectId}`)}
      />
      <DuplicateStreamModal
        opened={showDuplicateModal}
        onClose={closeDuplicate}
        records={selectedRecords}
      />
      <EditTagsModal
        opened={showEditTagsModal}
        onClose={closeEditTags}
        records={selectedRecords.map(r => streamStore.streams[r.slug] ?? r)}
      />
    </PageContainer>
  );
});

export default Streams;
