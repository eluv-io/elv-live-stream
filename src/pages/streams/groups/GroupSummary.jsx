import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Link, useNavigate, useParams} from "react-router-dom";
import {useDebouncedCallback} from "@mantine/hooks";
import {IconDeviceAnalytics} from "@tabler/icons-react";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import CollapsibleSection from "@/components/collapsible-section/CollapsibleSection.jsx";
import StreamsTable from "@/pages/streams/table/StreamsTable.jsx";
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

  const Refresh = () => {
    streamGroupStore.LoadGroupData({titleId});
    streamStore.LoadAllStreams({force: true});
  };

  const DebouncedRefresh = useDebouncedCallback(Refresh, 500);

  useEffect(() => {
    streamGroupStore.LoadGroupData({titleId});
    streamStore.LoadAllStreams();
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

  const records = Object.values(streamStore.allStreams || {})
    .filter(stream => stream.titleId === titleId)
    .sort(SortTable({sortStatus}));

  return (
    <PageContainer
      title={`Distribution Summary - ${titleId}`}
      actions={actions}
    >
      <CollapsibleSection title="Sources" defaultOpen>
        <StreamsTable
          records={records}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          fetching={streamStore.loadingAllStreams && records.length === 0}
          onNameClick={objectId => navigate(`/streams/${objectId}`)}
          getRowActions={PreviewAction}
        />
      </CollapsibleSection>
    </PageContainer>
  );
});

export default GroupSummary;
