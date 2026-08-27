import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {useNavigate} from "react-router-dom";
import {useDisclosure} from "@mantine/hooks";
import {ActionIcon, Group, Select, Text, Tooltip} from "@mantine/core";
import DuplicateStreamModal from "@/pages/streams/modals/DuplicateStreamModal.jsx";
import EditTagsModal from "@/pages/streams/modals/EditTagsModal.jsx";
import {dataStore, modalStore, streamStore, streamGroupStore} from "@/stores/index.ts";
import {DATE_RANGE_PRESET_OPTIONS, DEFAULT_DATE_PRESET, FormatDateRangeLabel, GetDateRangePreset, ShiftDateRangePreset, SortTable} from "@/utils/helpers.ts";
import {useDebouncedCallback} from "@mantine/hooks";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import Actions from "@/components/table/actions/Actions.jsx";
import TagFilterRow from "@/components/table/tag-filter-row/TagFilterRow.jsx";
import BatchActions from "@/components/table/batch-actions/BatchActions.jsx";
import {notifications} from "@mantine/notifications";
import {IconChevronLeft, IconChevronRight, IconCopy, IconLabel, IconPlayerPlay, IconPlayerStop, IconTrash} from "@tabler/icons-react";
import {CalendarMonthIcon} from "@/assets/icons/index.js";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "date", direction: "desc"});
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [showDuplicateModal, {open: openDuplicate, close: closeDuplicate}] = useDisclosure(false);
  const [showEditTagsModal, {open: openEditTags, close: closeEditTags}] = useDisclosure(false);
  const [datePreset, setDatePreset] = useState(DEFAULT_DATE_PRESET);
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [expandedGroups, setExpandedGroups] = useState([]);
  const navigate = useNavigate();

  const ToggleGroup = (titleId) =>
    setExpandedGroups(prev => prev.includes(titleId) ? prev.filter(t => t !== titleId) : [...prev, titleId]);

  const ViewGroupSummary = (group) => {
    // TODO: open the group summary view once the group-data source is wired
    streamGroupStore.LoadGroupData({titleId: group.titleId});
  };

  const SelectDatePreset = (preset) => {
    const date = new Date();
    setDatePreset(preset);
    setReferenceDate(date);
    streamStore.SetDateRangeFilter(GetDateRangePreset(preset, date));
    DebouncedRefresh();
  };

  const ShiftDate = (direction) => {
    const date = ShiftDateRangePreset(datePreset, referenceDate, direction);
    setReferenceDate(date);
    streamStore.SetDateRangeFilter(GetDateRangePreset(datePreset, date));
    DebouncedRefresh();
  };

  useEffect(() => {
    streamStore.SetDateRangeFilter(GetDateRangePreset(datePreset, referenceDate));

    // Reload if nothing is loaded, or if what's loaded is the full (unscoped) set
    // from another page - the streams page needs its date-filtered view.
    if(!dataStore.streamsLoaded || !dataStore.streamsScoped) {
      dataStore.LoadSiteStreams();
    }
  }, []);

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.LoadSiteStreams({reload: true});
  }, 500);

  const records = streamStore.filteredStreams.slice().sort(SortTable({sortStatus}));

  const datePresetLabel = DATE_RANGE_PRESET_OPTIONS.find(({value}) => value === datePreset)?.label.toLowerCase();
  const dateRangeLabel = FormatDateRangeLabel(datePreset, referenceDate);

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
      titleRightSection={
        <Group gap={16} wrap="nowrap">
          {dateRangeLabel && (
            <Text fz="1.25rem" fw={400} style={{whiteSpace: "nowrap"}}>
              {dateRangeLabel}
            </Text>
          )}
          <Group gap={8} wrap="nowrap">
            <Tooltip label={`Previous ${datePresetLabel}`} disabled={datePreset === "all"}>
              <ActionIcon variant="subtle" color="elv-gray.6" disabled={datePreset === "all"} onClick={() => ShiftDate(-1)}>
                <IconChevronLeft size={24} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={`Next ${datePresetLabel}`} disabled={datePreset === "all"}>
              <ActionIcon variant="subtle" color="elv-gray.6" disabled={datePreset === "all"} onClick={() => ShiftDate(1)}>
                <IconChevronRight size={24} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Select
            data={DATE_RANGE_PRESET_OPTIONS}
            value={datePreset}
            onChange={SelectDatePreset}
            allowDeselect={false}
            leftSection={<CalendarMonthIcon size={20} />}
            w={130}
          />
        </Group>
      }
    >
      <Actions
        actions={[
          {label: "Create", id: "create-action", variant: "filled", onClick: () => navigate("/streams/create")},
          {label: "Refresh", id: "refresh-action", variant: "outline", onClick: DebouncedRefresh}
        ]}
        searchValue={streamStore.tableFilter}
        onSearchChange={(event) => streamStore.SetTableFilter(event.target.value)}
        tagOptions={streamStore.allTags}
        tagFilter={streamStore.activeTagFilter}
        onTagFilterChange={(tags) => streamStore.SetTableTagFilter(tags)}
      />
      <TagFilterRow
        tags={streamStore.allTags}
        selectedTags={streamStore.activeTagFilter}
        onTagToggle={(tag) => {
          const current = streamStore.tableTagFilter;
          streamStore.SetTableTagFilter(
            current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
          );
          setSelectedRecords([]);
        }}
        onClearAll={() => streamStore.SetTableTagFilter([])}
      />

      <BatchActions
        selectedRecords={selectedRecords}
        SelectAll={() => setSelectedRecords(records)}
        ClearSelection={() => setSelectedRecords([])}
        actions={batchActions}
      />
      <StreamsTable
        records={records}
        groups={Object.values(streamGroupStore.groups || {})}
        expandedGroups={expandedGroups}
        onToggleGroup={ToggleGroup}
        onViewSummary={ViewGroupSummary}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        selectedRecords={selectedRecords}
        onSelectedRecordsChange={setSelectedRecords}
        fetching={!dataStore.streamsLoaded}
        onNameClick={objectId => navigate(`/streams/${objectId}`)}
        onLoadMore={() => dataStore.LoadMoreSiteStreams()}
        hasMore={dataStore.hasMoreStreams}
        loadingMore={dataStore.loadingMoreStreams}
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
