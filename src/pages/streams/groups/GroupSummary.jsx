import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import {Link, useNavigate, useParams} from "react-router-dom";
import {Box, Group, Text} from "@mantine/core";
import {useDebouncedCallback} from "@mantine/hooks";
import {IconChevronRight, IconDeviceAnalytics} from "@tabler/icons-react";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import TagFilterRow from "@/components/table/tag-filter-row/TagFilterRow.jsx";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
import OutputUrlsBySource from "@/pages/streams/groups/OutputUrlsBySource.jsx";
import {SortTable} from "@/utils/helpers.ts";
import {streamStore, streamGroupStore} from "@/stores/index.ts";

// Preview is the only row action on the group summary table.
const PreviewAction = (record) => [
  {
    label: "Preview",
    title: "Preview Stream",
    icon: <IconDeviceAnalytics />,
    iconVariant: "subtle",
    iconColor: "gray.6",
    component: Link,
    to: `/streams/${record.objectId}/preview`
  }
];

// Skeleton - distribution summary for a stream group, keyed by title_id.
// TODO: build out the real summary once the group-data source is wired.
const GroupSummary = observer(() => {
  const navigate = useNavigate();
  const {id: titleId} = useParams();
  const [sortStatus, setSortStatus] = useState({columnAccessor: "date", direction: "desc"});
  // All page state is local - nothing is written to a store, localStorage, or user settings.
  const [tagFilter, setTagFilter] = useState([]);
  const [streams, setStreams] = useState({});
  const [loading, setLoading] = useState(true);
  const [outputUrls, setOutputUrls] = useState({});
  const [loadingUrls, setLoadingUrls] = useState(true);
  const loadId = useRef(0);

  const LoadData = async () => {
    const runId = ++loadId.current;
    setLoading(true);
    setLoadingUrls(true);
    streamGroupStore.LoadGroupData({titleId});

    // Load + enrich only this group's streams, not the whole tenant.
    const map = await streamStore.LoadStreamsByTitleId(titleId);
    if(runId !== loadId.current) { return; }
    setStreams(map);
    setLoading(false);

    const objectIds = Object.values(map).map(stream => stream.objectId).filter(Boolean);
    if(objectIds.length === 0) { setLoadingUrls(false); return; }

    const statuses = await streamStore.StreamStatuses(objectIds);
    if(runId !== loadId.current) { return; }
    setStreams(current => {
      const next = {...current};
      Object.keys(next).forEach(slug => {
        const status = statuses[next[slug].objectId];
        if(status) { next[slug] = {...next[slug], ...status}; }
      });
      return next;
    });

    const urls = await streamStore.StreamOutputUrls(objectIds);
    if(runId !== loadId.current) { return; }
    setOutputUrls(urls);
    setLoadingUrls(false);
  };

  const DebouncedRefresh = useDebouncedCallback(LoadData, 500);

  useEffect(() => {
    LoadData();
     
  }, [titleId]);

  const actions = [
    {
      label: "Back",
      buttonVariant: "filled",
      color: "elv-gray.6",
      onClick: () => navigate(-1)
    },
    {
      label: "Refresh",
      buttonVariant: "outline",
      onClick: DebouncedRefresh
    }
  ];

  const streamList = Object.values(streams);

  const allTags = Array.from(
    new Set(streamList.flatMap(stream => stream.tags || []))
  ).sort();

  const activeTagFilter = tagFilter.filter(tag => allTags.includes(tag));

  const ToggleTag = (tag) => setTagFilter(current =>
    current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
  );

  const records = streamList
    .filter(stream =>
      activeTagFilter.length === 0 || activeTagFilter.some(tag => stream.tags?.includes(tag))
    )
    .sort(SortTable({sortStatus}));

  return (
    <PageContainer
      title={`Distribution Summary - ${titleId}`}
      actions={actions}
    >
      <Group gap={8} wrap="nowrap" mb={4}>
        <IconChevronRight size={20} color="var(--mantine-color-elv-blue-3)" />
        <Text fz="1.125rem" fw={600} c="elv-blue.3">Sources</Text>
      </Group>
      <Box pt={16}>
        <TagFilterRow
          tags={allTags}
          selectedTags={activeTagFilter}
          onTagToggle={ToggleTag}
          onClearAll={() => setTagFilter([])}
        />
        <StreamsTable
          records={records}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          fetching={loading && streamList.length === 0}
          onNameClick={objectId => navigate(`/streams/${objectId}`)}
          getRowActions={PreviewAction}
          maxHeight={480}
        />
      </Box>

      <OutputUrlsBySource
        streams={records}
        outputUrls={outputUrls}
        loading={loadingUrls}
      />
    </PageContainer>
  );
});

export default GroupSummary;
