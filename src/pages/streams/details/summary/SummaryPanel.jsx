import {useEffect, useState} from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Flex,
  Group,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
  Tooltip
} from "@mantine/core";
import {streamStore, streamEditStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";
import {useParams} from "react-router-dom";
import {
  AudioBitrateReadable,
  BytesToMb,
  DateFormat,
  FormatTime,
  SampleRateReadable,
  VideoBitrateReadable
} from "@/utils/helpers.js";
import {
  STATUS_MAP,
  QUALITY_TEXT,
  QUALITY_COLOR_MAP,
  SOURCE_PACKAGING_COLOR_MAP, CODEC_TEXT
} from "@/utils/constants.js";
import RecordingPeriodsTable from "@/pages/streams/details/summary/components/RecordingPeriodsTable.jsx";
import RecordingCopiesTable from "@/pages/streams/details/summary/components/RecordingCopiesTable.jsx";
import {IconCopy} from "@tabler/icons-react";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import styles from "@/pages/streams/details/summary/SummaryPanel.module.css";
import {useClipboard} from "@mantine/hooks";
import DetailCard, {DetailCardBody, SubDetailCard} from "@/components/detail-card/DetailCard.jsx";
import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import sharedStyles from "@/assets/shared.module.css";

export const Runtime = ({
  startTime,
  endTime,
  currentTimeMs,
  format="hh,mm,ss",
  active
}) => {
  let time;

  if(!endTime && !active) {
    return "--";
  } else if(!endTime) {
    endTime = currentTimeMs;
  }

  if(!startTime) {
    time = "--";
  } else {
    time = FormatTime({
      milliseconds: endTime - startTime,
      format
    });
  }

  return time;
};

const SummaryPanel = observer(({libraryId, title, recordingInfo, currentRetention, currentPersistent, slug, status: cachedStatus}) => {
  const [status, setStatus] = useState({state: cachedStatus});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});
  const [loading, setLoading] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);
  const [selectedSourceAudio, setSelectedSourceAudio] = useState(0);
  const [selectedPackagingAudio, setSelectedPackagingAudio] = useState(1);

  const params = useParams();
  const clipboard = useClipboard({timeout: 2000});
  const currentTimeMs = new Date().getTime();

  useEffect(() => {
    const LoadData = async() => {
      const libraryId = streamStore.streams[slug]?.libraryId;
      await streamStore.LoadSummaryData({objectId: params.id, libraryId, slug});
    };

    const LoadStatus = async () => {
      try {
        setLoadingStatus(true);
        const statusResponse = await streamStore.CheckStatus({
          objectId: params.id,
          slug,
          update: true
        });

        setStatus(statusResponse);
      } finally {
        setLoadingStatus(false);
      }
    };

    const LoadEmbedUrl = async() => {
      const url = await streamStore.EmbedUrl({objectId: params.id});
      setEmbedUrl(url);
    };

    LoadData();
    LoadLiveRecordingCopies();
    LoadStatus();
    LoadEmbedUrl();
  }, [params.id]);

  const LoadLiveRecordingCopies = async() => {
    try {
      setLoading(true);
      let liveRecordingCopies = await streamEditStore.FetchLiveRecordingCopies({
        objectId: params.id
      });

      Object.keys(liveRecordingCopies || {}).forEach(id => (
        liveRecordingCopies[id]["_id"] = id
      ));

      setLiveRecordingCopies(liveRecordingCopies || {});
    } finally {
      setLoading(false);
    }
  };

  const stream = streamStore.streams[slug];

  const recordingData = [
    {
      label: "Recording Start",
      value: recordingInfo?._recordingStartTime ?
        DateFormat({
          time: recordingInfo?._recordingStartTime,
          format: "sec"
        }) : ""
    },
    {
      label: "Runtime",
      value: [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state) ? Runtime({
        startTime: recordingInfo?._recordingStartTime * 1000,
        currentTimeMs, active: true, format: "hh:mm:ss"
      }) : ""
    },
    {
      label: "Last Connect",
      value: status?.recordingPeriod?.startTimeEpochSec ?
        DateFormat({
          time: status?.recordingPeriod?.startTimeEpochSec,
          format: "sec"
        }) : ""
    },
    {
      label: "Last Runtime",
      value: [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state) ? Runtime({
        startTime: status?.recordingPeriod?.startTimeEpochSec * 1000,
        currentTimeMs, active: true, format: "hh:mm:ss"
      }) : ""
    }
  ].map(({label, value}) => ({label, value}));

  const sourceData = [
    {label: "Input", value: <Group gap={4}>{stream?.source?.map(el => <Badge key={`source-${el}`} radius={2} color={SOURCE_PACKAGING_COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>{el}</Badge>)}</Group>},
    {label: "Packets Recv / Drop (%)", value: status ? `${status?.input_stats?.ts?.packets_received?.toLocaleString() ?? 0} / ${status?.input_stats?.ts?.packets_dropped?.toLocaleString() ?? 0} (${status?.input_stats?.ts?.packets_received ? (status.input_stats.ts.packets_dropped / status.input_stats.ts.packets_received).toFixed(2) : 0}%)` : ""},
    {label: "Seq Errors / Gap", value: status ? `${status?.input_stats?.rtp?.seq_num_skip_tot ?? 0} / ${status?.input_stats?.rtp?.seq_num_skip_count ?? 0}` : ""},
  ];

  const packagingData = [
    {label: "Packaging", value: <Group gap={4}> {stream?.packaging?.map(el => <Badge key={`source-${el}`} radius={2} color={SOURCE_PACKAGING_COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>{el}</Badge>)}</Group>},
    {label: "Bytes", value: loadingStatus ? null : status?.recordingStatus?.video?.bytes_written ? BytesToMb(status?.recordingStatus?.video?.bytes_written) : ""},
    {label: "Incidents", value: 0}
  ];

  return (
    <>
      <Flex direction="row" gap={20} align="stretch">
        <Stack gap={12} w={355}>
          <SectionTitle>Preview</SectionTitle>
          {
            [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state) &&
            <Box w="100%">
              <VideoContainer
                index={0}
                slug={slug}
                showPreview
                playable={status?.state === STATUS_MAP.RUNNING}
                borderRadius={16}
              />
            </Box>
          }
          <DetailCard
            title="State"
            labelWidth={120}
            data={[
              {label: "Quality", value: <LabeledIndicator label={QUALITY_TEXT[status?.quality] || ""} color={status?.quality ? QUALITY_COLOR_MAP[status?.quality] : null} fw={600} />}
            ]}
          />
          <DetailCard
            flex={1}
            title="Recording Info"
            labelWidth={120}
            data={recordingData}
          />
        </Stack>

        <Flex direction="column" flex={1} gap={8}>
          <SectionTitle>Key Stats</SectionTitle>
          <SimpleGrid cols={2} spacing={20}>
            <DetailCard title="Source">
              <DetailCardBody id="source" data={sourceData} />
              <SubDetailCard
                title="Video"
                data={[
                  {label: "Stream ID", value: stream?.videoStreamProbe?.stream_id},
                  {label: "Bitrate", value: VideoBitrateReadable(stream?.videoStreamProbe?.bit_rate)},
                  {label: "Frame Rate", value: stream?.videoStreamProbe?.frame_rate ? `${stream?.videoStreamProbe?.frame_rate} fps` : ""},
                  {label: "Resolution", value: stream?.videoStreamProbe ? `${stream?.videoStreamProbe?.width}x${stream?.videoStreamProbe?.height}p` : ""},
                  {label: "Codec", value: stream?.videoStreamProbe?.codec_name ? CODEC_TEXT[stream?.videoStreamProbe?.codec_name] : ""}
                ]}
              />
              <SubDetailCard
                title="Audio"
                titleRightSection={<Select value={String(selectedSourceAudio)} onChange={(value) => setSelectedSourceAudio(parseInt(value))} data={Object.keys(stream?.audioStreams || {}).map(key => ({value: key, label: String(parseInt(key) + 1)}))} classNames={{input: styles.audioSelectInput, wrapper: styles.audioSelectWrapper}} allowDeselect={false} />}
                data={[
                  {label: "Stream ID", value: stream?.audioStreams?.[selectedSourceAudio]?.stream_id},
                  {label: "Bitrate", value: AudioBitrateReadable(stream?.audioStreams?.[selectedSourceAudio]?.bit_rate)},
                  {label: "Sample Rate", value: SampleRateReadable(stream?.audioStreams?.[selectedSourceAudio]?.sample_rate)},
                  {label: "Channels", value: stream?.audioStreams?.[selectedSourceAudio]?.channels},
                  {label: "Codec",value: stream?.audioStreams?.[selectedSourceAudio]?.codec_name}
                ]}
              />
            </DetailCard>
            <DetailCard
              title="Publishing"
            >
              <DetailCardBody id="packaging" data={packagingData} />
              <SubDetailCard
                title="Video"
                data={[
                  {label: "Stream ID", value: stream?.videoStreamProbe?.stream_id},
                  {label: "Bitrate", value: VideoBitrateReadable(stream?.publishingVideo?.bit_rate)},
                  {label: "Frame Rate", value: stream?.publishingVideo?.frame_rate ? `${stream?.publishingVideo?.frame_rate} fps` : ""},
                  {label: "Resolution", value: stream?.publishingVideo?.resolution},
                  {label: "Codec", value: stream?.publishingVideo?.codec}
                ]}
              />
              <SubDetailCard
                title="Audio"
                titleRightSection={<Select value={String(selectedPackagingAudio)} onChange={(value) => setSelectedPackagingAudio(value)} data={Object.keys(stream?.audioData || {}).map(key => ({value: key, label: key}))} classNames={{input: styles.audioSelectInput, wrapper: styles.audioSelectWrapper}} allowDeselect={false} />}
                data={[
                  {label: "Stream ID", value: selectedPackagingAudio},
                  {label: "Bitrate", value: AudioBitrateReadable(stream?.audioData?.[selectedPackagingAudio]?.recording_bitrate)},
                  {label: "Sample Rate", value: SampleRateReadable(stream?.publishingAudio?.sample_rate)},
                  {label: "Channels", value: stream?.audioData?.[selectedPackagingAudio]?.recording_channels},
                  {label: "Codec",value: stream?.audioData?.[selectedPackagingAudio]?.codec}
                ]}
              />
            </DetailCard>
          </SimpleGrid>
        </Flex>
      </Flex>

      {
        embedUrl &&
        <>
          <Divider mb={20} mt={20} />
          <SectionTitle mb={12}>
            <Group gap={8} mb={12}>
              <SectionTitle>Embeddable URL</SectionTitle>
              <Tooltip
                label={clipboard.copied ? "Copied" : "Copy"}
                position="bottom"
              >
                <ActionIcon
                  variant="transparent"
                  c="elv-gray.6"
                  size={16}
                  onClick={() => clipboard.copy(embedUrl)}
                >
                  <IconCopy size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </SectionTitle>
          <TextInput
            value={embedUrl}
            readOnly
          />
        </>
      }

      <Divider mb={20} mt={20} />

      <RecordingCopiesTable
        liveRecordingCopies={liveRecordingCopies}
        DeleteCallback={LoadLiveRecordingCopies}
        loading={loading}
      />

      <RecordingPeriodsTable
        libraryId={libraryId}
        objectId={params.id}
        records={recordingInfo?.live_offering}
        title={title}
        CopyCallback={LoadLiveRecordingCopies}
        currentTimeMs={currentTimeMs}
        retention={currentRetention}
        persistent={currentPersistent}
        status={status}
        loading={loading}
      />
    </>
  );
});

export default SummaryPanel;
