import {Box, Stack, Text} from "@mantine/core";
import {STATUS_MAP} from "@/utils/constants.ts";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import DetailCard from "@/components/detail-card/DetailCard.jsx";
import {BuildStateData, BuildRecordingData} from "@/pages/streams/details/summary/SummarySelectors.tsx";
import {TsPackagingOnly} from "@/utils/streamActions.jsx";
import {useMemo} from "react";

const PreviewSection = ({slug, status, recordingInfo, currentTimeMs, packaging}) => {
  const isActive = [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state);
  // No playable (fmp4) output when a stream is packaged as Transport Stream only.
  const tsPackagingOnly = TsPackagingOnly({packaging});

  const stateData = useMemo(() => BuildStateData({status}), [status]);
  const recordingData = useMemo(
    () => BuildRecordingData({recordingInfo, status, currentTimeMs}),
    [recordingInfo, status, currentTimeMs]
  );

  return (
    <Stack gap={12} w={355}>
      <SectionTitle>Preview</SectionTitle>
      {isActive && (
        <Box w="100%">
          {tsPackagingOnly ? (
            <Text c="dimmed" size="sm">Preview unavailable for Transport Stream-only packaging</Text>
          ) : (
            <VideoContainer
              index={0}
              slug={slug}
              showPreview
              playable={status?.state === STATUS_MAP.RUNNING}
              borderRadius={16}
            />
          )}
        </Box>
      )}
      <DetailCard title="State" labelWidth={120} data={stateData} />
      <DetailCard flex={1} title="Recording Info" labelWidth={120} data={recordingData} />
    </Stack>
  );
};

export default PreviewSection;
