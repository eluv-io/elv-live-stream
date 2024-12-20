import {useEffect, useState} from "react";
import {ActionIcon, Box, Code, Flex, Grid, Skeleton, Stack, Text, Title} from "@mantine/core";
import {streamStore} from "@/stores";
import {observer} from "mobx-react-lite";
import {useParams} from "react-router-dom";
import {DateFormat, FormatTime} from "@/utils/helpers";
import {STATUS_MAP, QUALITY_TEXT, RETENTION_TEXT} from "@/utils/constants";
import RecordingPeriodsTable from "@/pages/stream-details/details/RecordingPeriodsTable";
import RecordingCopiesTable from "@/pages/stream-details/details/RecordingCopiesTable";
import {IconAlertCircle, IconCheck} from "@tabler/icons-react";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import {CopyToClipboard} from "@/utils/helpers";
import {ClipboardIcon} from "@/assets/icons";

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

const DetailsPanel = observer(({libraryId, title, recordingInfo, currentRetention, slug, embedUrl}) => {
  const [frameSegmentUrl, setFrameSegmentUrl] = useState("");
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});

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

    LoadLiveRecordingCopies();
    LoadStatus();
  }, [params.id]);

  const LoadLiveRecordingCopies = async() => {
    let liveRecordingCopies = await streamStore.FetchLiveRecordingCopies({
      objectId: params.id
    });

    Object.keys(liveRecordingCopies || {}).forEach(id => (
      liveRecordingCopies[id]["_id"] = id
    ));

    setLiveRecordingCopies(liveRecordingCopies || {});
  };

  return (
    <>
      <Grid>
        <Grid.Col span={8}>
          <Flex direction="column" style={{flexGrow: "1"}}>
            <Box mb="24px" maw="70%">
              <Title order={3} c="elv-gray.8">State</Title>
              <Text>Quality: {QUALITY_TEXT[status?.quality] || "--"}</Text>
              {
                status?.warnings &&
                <>
                  <Box mt={16}>
                    <Code block icon={<IconAlertCircle />} color="rgba(250, 176, 5, 0.07)" style={{borderLeft: "4px solid var(--mantine-color-yellow-filled)", borderRadius: 0}}>
                      {(status?.warnings || []).map(item => (
                        <Text key={`warning-${item}`}>{item}</Text>
                      ))}
                    </Code>
                  </Box>
                </>
              }
            </Box>
            <Box mb="24px" maw="70%">
              <Title order={3} c="elv-gray.8">Recording Info</Title>
              <Text>
                Created: {
                  recordingInfo?._recordingStartTime ?
                    DateFormat({
                      time: recordingInfo?._recordingStartTime,
                      format: "sec"
                    }) : "--"
                }
              </Text>
              <Text>
                Retention: { currentRetention ? RETENTION_TEXT[currentRetention] : "--" }
              </Text>
              <Text>
                Current Period Started: {
                  status?.recording_period?.start_time_epoch_sec ?
                    DateFormat({
                      time: status?.recording_period?.start_time_epoch_sec,
                      format: "sec"
                    }) : "--"
                }
              </Text>
              <Text>
                Current Period Runtime: {
                  [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state) ? Runtime({
                    startTime: status?.recording_period?.start_time_epoch_sec * 1000,
                    currentTimeMs
                  }) : "--"
                }
              </Text>
            </Box>
            <RecordingCopiesTable
              liveRecordingCopies={liveRecordingCopies}
              DeleteCallback={LoadLiveRecordingCopies}
            />
          </Flex>
        </Grid.Col>
        <Grid.Col span={4}>
          <Flex>
            <Stack gap={0}>
              <Title order={3} c="elv-gray.8">Preview</Title>
              <Skeleton visible={frameSegmentUrl === undefined || !status} height={200} width={350}>
                {
                  (status?.state === STATUS_MAP.RUNNING && frameSegmentUrl) ?
                    <VideoContainer
                      index={0}
                      slug={slug}
                      showPreview
                    /> :
                    <Box bg="gray.3" h="100%" margin="auto" ta="center" style={{borderRadius: "4px"}}>
                      <Text lh="200px">Preview is not available</Text>
                    </Box>
                }
              </Skeleton>
              <Skeleton visible={!status} mt={16}>
                {
                  embedUrl &&
                  <Flex direction="row" justify="center" align="center">
                    <Text size="xs" truncate="end" maw={300} ta="center">{embedUrl}</Text>
                    <ActionIcon variant="transparent" onClick={() => {
                      CopyToClipboard({text: embedUrl});
                      setCopied(true);

                      setTimeout(() => {
                        setCopied(false);
                      }, [3000]);
                    }}>
                      {
                        copied ?
                          <IconCheck height={16} width={16}/> : <ClipboardIcon/>
                      }
                    </ActionIcon>
                  </Flex>
                }
              </Skeleton>
            </Stack>
          </Flex>
        </Grid.Col>
      </Grid>
      <Title order={3} c="elv-gray.8">Recording Periods</Title>
      <RecordingPeriodsTable
        libraryId={libraryId}
        objectId={params.id}
        records={recordingInfo?.live_offering}
        title={title}
        CopyCallback={LoadLiveRecordingCopies}
        currentTimeMs={currentTimeMs}
        retention={currentRetention}
        status={status}
      />
    </>
  );
});

export default DetailsPanel;
