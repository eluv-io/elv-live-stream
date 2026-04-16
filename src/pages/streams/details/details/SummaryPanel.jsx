import {useEffect, useState} from "react";
import {Badge, Box, Button, Code, Flex, Grid, Group, Select, SimpleGrid, Stack, Text, Tooltip} from "@mantine/core";
import {dataStore, streamBrowseStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";
import {useParams} from "react-router-dom";
import {DateFormat, FormatTime} from "@/utils/helpers.js";
import {
  STATUS_MAP,
  QUALITY_TEXT,
  QUALITY_COLOR_MAP,
  SOURCE_PACKAGING_COLOR_MAP
} from "@/utils/constants.js";
import RecordingPeriodsTable from "@/pages/streams/details/details/components/RecordingPeriodsTable.jsx";
import RecordingCopiesTable from "@/pages/streams/details/details/components/RecordingCopiesTable.jsx";
import {IconAlertCircle, IconLink} from "@tabler/icons-react";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import styles from "@/pages/streams/details/details/SummaryPanel.module.css";
import {useClipboard} from "@mantine/hooks";
import DetailCard, {DetailCardBody, SubDetailCard} from "@/components/detail-card/DetailCard.jsx";
import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import {toJS} from "mobx";
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

const DetailRow = ({label, value}) => {
  return (
    <Group key={`detail-${label}`} gap={4}>
      <Text fz={14}>
        { label }:
      </Text>
      <Text fz={14}>
        { value }
      </Text>
    </Group>
  );
};

const SummaryPanel = observer(({libraryId, title, recordingInfo, currentRetention, currentPersistent, slug}) => {
  const [status, setStatus] = useState(null);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});
  const [loading, setLoading] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(0);

  const params = useParams();
  const clipboard = useClipboard({timeout: 2000});
  const currentTimeMs = new Date().getTime();

  useEffect(() => {
    const LoadStatus = async () => {
      const statusResponse = await streamBrowseStore.CheckStatus({
        objectId: params.id
      });

      setStatus(statusResponse);
    };

    const LoadEmbedUrl = async() => {
      const url = await dataStore.EmbedUrl({objectId: params.id});
      setEmbedUrl(url);
    };

    LoadLiveRecordingCopies();
    LoadStatus();
    LoadEmbedUrl();
  }, [params.id]);

  const LoadLiveRecordingCopies = async() => {
    try {
      setLoading(true);
      let liveRecordingCopies = await streamBrowseStore.FetchLiveRecordingCopies({
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

  const stream = streamBrowseStore.streams[slug];

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
    {label: "Input", value: stream?.source?.map(el => <Group gap={4} key={`source-${el}`}><Badge radius={2} color={SOURCE_PACKAGING_COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>{el}</Badge></Group>)},
    {label: "Packets Recv / Drop (%)"},
    {label: "Seq Errors / Gap"},
  ];

  const packagingData = [
    {label: "Packaging", value: stream?.packaging?.map(el => <Group key={`source-${el}`} gap={4}><Badge radius={2} color={SOURCE_PACKAGING_COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>{el}</Badge></Group>)}
  ];

  console.log("stream", toJS(streamBrowseStore.streams[slug]));

  return (
    <>
      <Flex direction="row" gap={20}>
        <Stack gap={12}>
          <SectionTitle>Preview</SectionTitle>
          <Box w={355}>
            <VideoContainer
              index={0}
              slug={slug}
              showPreview
              playable={status === STATUS_MAP.RUNNING}
              borderRadius={16}
            />
          </Box>
          <DetailCard
            title="State"
            data={[
              {label: "Quality", value: <LabeledIndicator label={QUALITY_TEXT[status?.quality] || ""} color={status?.quality ? QUALITY_COLOR_MAP[status?.quality] : null} fw={600} />}
            ]}
          />
          <DetailCard
            title="Recording Info"
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
                  {label: "Stream ID"},
                  {label: "Bitrate"},
                  {label: "Frame Rate"},
                  {label: "Resolution"},
                  {label: "Codec"}
                ]}
              />
              <SubDetailCard
                title="Audio"
                titleRightSection={<Select value={String(selectedAudio)} onChange={(value) => setSelectedAudio(parseInt(value))} data={Object.keys(stream?.audioStreams || {}).map(key => ({value: key, label: String(parseInt(key) + 1)}))} classNames={{input: styles.audioSelectInput, wrapper: styles.audioSelectWrapper}} allowDeselect={false} />}
                data={[
                  {label: "Stream ID", value: stream?.audioStreams?.[selectedAudio]?.stream_id},
                  {label: "Bitrate", value: stream?.audioStreams?.[selectedAudio]?.bit_rate},
                  {label: "Channels", value: stream?.audioStreams?.[selectedAudio]?.channels},
                  {label: "Codec",value: stream?.audioStreams?.[selectedAudio]?.codec_name}
                ]}
              />
            </DetailCard>
            <DetailCard
              title="Publishing"
              data={packagingData}
            />
          </SimpleGrid>
        </Flex>
      </Flex>

      <Grid>
        <Grid.Col span={8}>
          <Flex direction="column" className={styles.flexGrow}>
            <Box mb="30px" maw="80%">
              <SectionTitle mb={5}>State</SectionTitle>
              <DetailRow
                label="Quality"
                value={QUALITY_TEXT[status?.quality] || "--"}
              />
              {
                status?.warnings &&
                <>
                  <Box mt={16}>
                    <Code block icon={<IconAlertCircle />} color="rgba(250, 176, 5, 0.07)" className={styles.code}>
                      {(status?.warnings || []).map(item => (
                        <Text key={`warning-${item}`} fz={14}>{item}</Text>
                      ))}
                    </Code>
                  </Box>
                </>
              }
            </Box>
          </Flex>
        </Grid.Col>
        <Grid.Col span={4}>
          <Flex>
            <Stack gap={0}>
              <Group gap={6} justify="center">
                {
                  [
                    {label: "Copy Embeddable URL", value: embedUrl, hidden: !embedUrl, id: "embeddable-url-link"},
                    // {label: "Copy SRT URL", value: srtUrl, hidden: !egressEnabled, id: "srt-url-link"}
                  ]
                    .filter(item => !item.hidden)
                    .map(item => (
                      <Tooltip
                        key={item.id}
                        label={clipboard.copied ? "Copied" : "Copy"}
                        position="bottom"
                      >
                        <Button
                          size="xs"
                          variant="outline"
                          color="elv-gray.5"
                          mt={8}
                          onClick={() => clipboard.copy(item.value)}
                          leftSection={<IconLink color="var(--mantine-color-elv-gray-8)" />}
                        >
                          <Text c="elv-gray.8" fz={12} fw={500}>
                            { item.label }
                          </Text>
                        </Button>
                      </Tooltip>
                    ))
                }
              </Group>
            </Stack>
          </Flex>
        </Grid.Col>
      </Grid>

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
