import {Divider, Flex} from "@mantine/core";
import {streamStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";
import RecordingPeriodsTable from "@/pages/streams/details/summary/components/RecordingPeriodsTable.jsx";
import RecordingCopiesTable from "@/pages/streams/details/summary/components/RecordingCopiesTable.jsx";
import PreviewSection from "@/pages/streams/details/summary/components/PreviewSection.jsx";
import KeyStatsSection from "@/pages/streams/details/summary/components/KeyStatsSection.jsx";
import EmbedUrlSection from "@/pages/streams/details/summary/components/EmbedUrlSection.jsx";
import useSummaryData from "@/pages/streams/details/summary/useSummaryData.js";

const SummaryPanel = observer(({recordingInfo, slug}) => {
  const libraryId = streamStore.streams?.[slug]?.libraryId;
  const currentTimeMs = new Date().getTime();

  const {
    objectId,
    status,
    loadingStatus,
    liveRecordingCopies,
    loading,
    embedUrl,
    LoadLiveRecordingCopies
  } = useSummaryData({slug, libraryId});

  const stream = streamStore.streams[slug];

  return (
    <>
      <Flex direction="row" gap={20} align="stretch">
        <PreviewSection
          slug={slug}
          status={status}
          recordingInfo={recordingInfo}
          currentTimeMs={currentTimeMs}
        />
        <KeyStatsSection
          stream={stream}
          status={status}
          loadingStatus={loadingStatus}
        />
      </Flex>

      <EmbedUrlSection embedUrl={embedUrl} />

      <Divider mb={20} mt={20} />

      <RecordingCopiesTable
        liveRecordingCopies={liveRecordingCopies}
        DeleteCallback={LoadLiveRecordingCopies}
        EditCallback={LoadLiveRecordingCopies}
        loading={loading}
      />

      <RecordingPeriodsTable
        libraryId={libraryId}
        objectId={objectId}
        records={recordingInfo?.live_offering}
        title={streamStore.streams?.[slug]?.title}
        CopyCallback={LoadLiveRecordingCopies}
        currentTimeMs={currentTimeMs}
        status={status}
        loading={loading}
        slug={slug}
      />
    </>
  );
});

export default SummaryPanel;
