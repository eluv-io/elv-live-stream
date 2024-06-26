import React, {useEffect, useState} from "react";
import {Box, Code, Flex, Grid, Skeleton, Stack, Text} from "@mantine/core";
import {dataStore, streamStore} from "Stores";
import {observer} from "mobx-react";
import {useParams} from "react-router-dom";
import {DateFormat, FormatTime} from "Stores/helpers/Misc";
import {STATUS_MAP} from "Data/StreamData";
import ClipboardIcon from "Assets/icons/ClipboardIcon";
import {CopyToClipboard} from "Stores/helpers/Actions";
import {IconCheck} from "@tabler/icons-react";
import DetailsPeriodsTable from "Pages/stream-details/details/DetailsPeriodsTable";
import DetailsRecordingCopiesTable from "Pages/stream-details/details/DetailsRecordingCopiesTable";
import {QUALITY_TEXT} from "Data/HumanReadableText";
import {IconAlertCircle} from "@tabler/icons-react";
import {VideoContainer} from "Pages/monitor/Monitor";

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

const DetailsPanel = observer(({slug, embedUrl, title, recordingInfo}) => {
  const [frameSegmentUrl, setFrameSegmentUrl] = useState();
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
              <div className="form__section-header">State</div>
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
              <div className="form__section-header">Recording Info</div>
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
            <DetailsRecordingCopiesTable
              liveRecordingCopies={liveRecordingCopies}
              DeleteCallback={LoadLiveRecordingCopies}
            />
          </Flex>
        </Grid.Col>
        <Grid.Col span={4}>
          <Flex>
            <Stack gap={0}>
              <div className="form__section-header">Preview</div>
              <Skeleton visible={frameSegmentUrl === undefined || !status} height={200} width={350}>
                {
                  (status?.state === STATUS_MAP.RUNNING && frameSegmentUrl) ?
                    <VideoContainer index={0} slug={slug} showPreview /> :
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
                    <button type="button" onClick={() => {
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
                    </button>
                  </Flex>
                }
              </Skeleton>
            </Stack>
          </Flex>
        </Grid.Col>
      </Grid>
      <div className="form__section-header">Recording Periods</div>
      <DetailsPeriodsTable
        objectId={params.id}
        records={recordingInfo?.live_offering}
        title={title}
        CopyCallback={LoadLiveRecordingCopies}
        currentTimeMs={currentTimeMs}
      />
    </>
  );
});

export default DetailsPanel;
