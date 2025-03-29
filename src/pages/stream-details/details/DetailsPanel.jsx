import {useEffect, useState} from "react";
import {ActionIcon, Box, Code, Flex, Grid, Group, Skeleton, Stack, Text, Title, Tooltip} from "@mantine/core";
import {dataStore, streamStore} from "@/stores";
import {observer} from "mobx-react-lite";
import {useParams} from "react-router-dom";
import {DateFormat, FormatTime} from "@/utils/helpers";
import {STATUS_MAP, QUALITY_TEXT, RETENTION_TEXT} from "@/utils/constants";
import RecordingPeriodsTable from "@/pages/stream-details/details/components/RecordingPeriodsTable.jsx";
import RecordingCopiesTable from "@/pages/stream-details/details/components/RecordingCopiesTable.jsx";
import {IconAlertCircle} from "@tabler/icons-react";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import {CopyToClipboard} from "@/utils/helpers";
import {CopyIcon} from "@/assets/icons";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import styles from "./DetailsPanel.module.css";

export const Runtime = ({startTime, endTime, currentTimeMs, format="hh,mm,ss"}) => {
  let time;

  if(!endTime) {
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

const DetailsPanel = observer(({libraryId, title, recordingInfo, currentRetention, slug}) => {
  const [frameSegmentUrl, setFrameSegmentUrl] = useState("");
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});
  const [loading, setLoading] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);

  const params = useParams();
  const currentTimeMs = new Date().getTime();

  useEffect(() => {
    const LoadStatus = async () => {
      const statusResponse = await streamStore.CheckStatus({
        objectId: params.id
      });

      let frameUrl = "";
      if(statusResponse?.state === STATUS_MAP.RUNNING) {
        streamStore.StreamFrameURL(slug).then(url => setFrameSegmentUrl(url));
      }

      setStatus(statusResponse);
      setFrameSegmentUrl(frameUrl || "");
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
      let liveRecordingCopies = await streamStore.FetchLiveRecordingCopies({
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

  return (
    <>
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
            <Box mb="30px" maw="70%">
              <SectionTitle mb={5}>Recording Info</SectionTitle>
              {
                [
                  {
                    label: "Created",
                    value: recordingInfo?._recordingStartTime ?
                      DateFormat({
                        time: recordingInfo?._recordingStartTime,
                        format: "sec"
                      }) : "--"
                  },
                  {
                    label: "Retention",
                    value: currentRetention ? RETENTION_TEXT[currentRetention] : "--"
                  },
                  {
                    label: "Current Period Started",
                    value: status?.recording_period?.start_time_epoch_sec ?
                      DateFormat({
                        time: status?.recording_period?.start_time_epoch_sec,
                        format: "sec"
                      }) : "--"
                  },
                  {
                    label: "Current Period Runtime",
                    value: [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state) ? Runtime({
                      startTime: status?.recording_period?.start_time_epoch_sec * 1000,
                      currentTimeMs
                    }) : "--"
                  }
                ].map(({label, value}) => (
                  <DetailRow key={`detail-${label}`} label={label} value={value} />
                ))
              }
            </Box>
          </Flex>
        </Grid.Col>
        <Grid.Col span={4}>
          <Flex>
            <Stack gap={0}>
              <Title order={3} c="elv-gray.9" mb={4}>Preview</Title>
              <Skeleton visible={frameSegmentUrl === undefined || !status} height={200} width={350} radius={16}>
                {
                  (status?.state === STATUS_MAP.RUNNING && frameSegmentUrl) ?
                    <VideoContainer
                      index={0}
                      slug={slug}
                      showPreview
                      playable={status.state === STATUS_MAP.RUNNING}
                      borderRadius={16}
                    /> :
                    <Box bg="gray.3" h="100%" margin="auto" ta="center" className={styles.borderRadius}>
                      <Title order={6} lh="200px" c="elv-gray.9">Preview is not available</Title>
                    </Box>
                }
              </Skeleton>
              <Skeleton visible={!status} mt={4} radius={16}>
                {
                  embedUrl &&
                  <Flex direction="row" justify="center" align="center">
                    <Title order={6} lineClamp={1} maw={300} c="elv-gray.6" className={styles.embedUrl}>{embedUrl}</Title>
                    <Tooltip label={copied ? "Copied": "Copy"} position="bottom">
                      <ActionIcon
                        variant="transparent"
                        onClick={() => {
                          CopyToClipboard({text: embedUrl});
                          setCopied(true);

                          setTimeout(() => {
                            setCopied(false);
                          }, [3000]);
                        }}
                      >
                        <CopyIcon color="var(--mantine-color-elv-neutral-5)" />
                      </ActionIcon>
                    </Tooltip>
                  </Flex>
                }
              </Skeleton>
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
        status={status}
        loading={loading}
      />
    </>
  );
});

export default DetailsPanel;
