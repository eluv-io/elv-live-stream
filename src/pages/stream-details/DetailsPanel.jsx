import React, {useEffect, useState} from "react";
import {ActionIcon, Box, Flex, Grid, Skeleton, Stack, Text} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {editStore, streamStore} from "Stores";
import {observer} from "mobx-react";
import {useParams} from "react-router-dom";
import {FormatTime, Pluralize} from "Stores/helpers/Misc";
import {STATUS_MAP} from "Data/StreamData";
import ClipboardIcon from "Assets/icons/ClipboardIcon";
import {CopyToClipboard} from "Stores/helpers/Actions";
import {RECORDING_STATUS_TEXT} from "Data/HumanReadableText";
import {IconCheck, IconExternalLink} from "@tabler/icons-react";
import {Loader} from "Components/Loader";
import {notifications} from "@mantine/notifications";

const StreamPeriodsTable = observer(({records=[], objectId, title, CopyCallback}) => {
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [copyingToVod, setCopyingToVod] = useState(false);

  const HandleCopy = async () => {
    try {
      setCopyingToVod(true);
      const response = await streamStore.CopyToVod({
        objectId,
        selectedPeriods: selectedRecords
      });

      await CopyCallback();

      notifications.show({
        title: `${title || objectId} copied to VoD`,
        message: `${response?.target_object_id} successfully created`,
        autoClose: false
      });
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to copy to VoD"
      });

      console.error("Unable to copy to VoD", error);
    } finally {
      setCopyingToVod(false);
    }
  };

  const RecordingStatusText = ({item, text=true}) => {
    let status;
    const videoIsEmpty = (item?.sources?.video || []).length === 0;

    if(videoIsEmpty) {
      status = "NOT_AVAILABLE";
    } else if(!videoIsEmpty && item?.sources?.video_trimmed > 0) {
      status = "PARTIALLY_AVAILABLE";
    } else {
      status = "AVAILABLE";
    }

    return text ? RECORDING_STATUS_TEXT[status] : status;
  };

  const CheckDurationMin = ({startTime, endTime}) => {
    if(endTime === 0 || startTime === 0) { return true; }

    return (endTime - startTime) >= 61000;
  };

  return (
    <>
      <Flex direction="row" justify="space-between">
        {
          selectedRecords.length === 0 ? "" : `${Pluralize({base: "item", count: selectedRecords.length})} selected`
        }
        <button
          type="button"
          className="button__primary"
          disabled={selectedRecords.length === 0 || copyingToVod}
          style={{marginLeft: "auto"}}
          onClick={HandleCopy}
        >
          {copyingToVod ? <Loader loader="inline" className="modal__loader"/> : "Copy to VoD"}
        </button>
      </Flex>
      <DataTable
        mb="4rem"
        columns={[
          {
            accessor: "recording_start_time_epoch_sec",
            title: "Start Time",
            render: record => (
              <Text>
                {
                  record.recording_start_time_epoch_sec ?
                    new Date(record.recording_start_time_epoch_sec * 1000).toLocaleTimeString() : ""
                }
              </Text>
            )
          },
          {
            accessor: "end_time_epoch_sec",
            title: "End Time",
            render: record => (
              <Text>
                {
                  record.end_time_epoch_sec ?
                    new Date(record.end_time_epoch_sec * 1000).toLocaleTimeString() : ""
                }
              </Text>
            )
          },
          {
            accessor: "runtime",
            title: "Runtime",
            render: record => (
              <Text>
                {
                  record.end_time_epoch_sec && record.start_time_epoch_sec ?
                    FormatTime({
                      milliseconds: record.end_time_epoch_sec * 1000 - record.start_time_epoch_sec * 1000,
                      format: "hh:mm:ss"
                    }) : ""
                }
              </Text>
            )
          },
          {
            accessor: "status",
            title: "Status",
            render: record => (
              <Text>
                {RecordingStatusText({item: record})}
              </Text>
            )
          }
        ]}
        minHeight={!records || records.length === 0 ? 150 : 75}
        noRecordsText="No recording periods found"
        records={records}
        selectedRecords={selectedRecords}
        onSelectedRecordsChange={setSelectedRecords}
        isRecordSelectable={record => (
          RecordingStatusText({item: record, text: false}) === "AVAILABLE" && CheckDurationMin({startTime: record.start_time_epoch_sec * 1000, endTime: record.end_time_epoch_sec * 1000})
        )}
        withTableBorder
        highlightOnHover
      />
    </>
  );
});

const DetailsPanel = observer(({slug, embedUrl, recordingInfo, title}) => {
  const [frameSegmentUrl, setFrameSegmentUrl] = useState();
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});
  const params = useParams();
  const currentTimeMs = new Date().getTime();

  useEffect(() => {
    const LoadDetails = async () => {
      const frameUrl = await streamStore.StreamFrameURL(slug);
      setFrameSegmentUrl(frameUrl);

      if(params.id) {
        const statusResponse = await streamStore.CheckStatus({
          objectId: params.id
        });
        setStatus(statusResponse);

        GetLiveRecordingCopies();
      }
    };

    LoadDetails();
  }, [params]);

  const GetLiveRecordingCopies = async() => {
    let liveRecordingCopies = await streamStore.FetchLiveRecordingCopies({
      objectId: params.id
    });

    Object.keys(liveRecordingCopies || {}).forEach(id => (
      liveRecordingCopies[id]["_id"] = id
    ));

    setLiveRecordingCopies(liveRecordingCopies || {});
  };

  const Runtime = ({startTime}) => {
    let time;
    const running = status?.state === STATUS_MAP.RUNNING;

    if(!running) {
      time = "--";
    } else {
      time = FormatTime({
        milliseconds: currentTimeMs - startTime
      });
    }

    return `Runtime: ${time}`;
  };

  const AvailableTime = ({endTime}) => {
    let time;
    const running = status?.state === STATUS_MAP.RUNNING;

    if(!running || !endTime) {
      time = "--";
    } else {
      time = endTime - currentTimeMs;
    }

    return `Available: ${time}`;
  };

  return (
    <>
      <Grid>
        <Grid.Col span={8}>
          <Flex direction="column" style={{flexGrow: "1"}}>
            <Box mb="24px" maw="60%">
              {/*<Title size="1.25rem" fw={400} color="elv-gray.9" mb="16px">Quality</Title>*/}
              <div className="form__section-header">Quality</div>
            </Box>
            <Box mb="24px" maw="60%">
              {/*<Title size="1.25rem" fw={400} color="elv-gray.9" mb="16px">Recording Info</Title>*/}
              <div className="form__section-header">Recording Info</div>
              <Text>
                Started: {status?.recording_period?.start_time_epoch_sec ? new Date(status?.recording_period?.start_time_epoch_sec * 1000).toString() : "--"}
              </Text>
              <Text>
                {
                  Runtime({
                    startTime: status?.recording_period?.start_time_epoch_sec * 1000
                  })
                }
              </Text>
              <Text>
                {
                  AvailableTime({
                    endTime: status?.recording_period?.end_time_epoch_sec
                  })
                }
              </Text>
            </Box>
            <Box mb="24px" maw="60%">
              <div className="form__section-header">Live Recording Copies</div>
              <DataTable
                idAccessor="_id"
                noRecordsText="No live recording copies found"
                minHeight={Object.values(liveRecordingCopies || {}) ? 150 : 75}
                columns={[
                  {
                    accessor: "id",
                    title: "Object ID",
                    render: record => (
                      <Text>{record._id}</Text>
                    )
                  },
                  {
                    accessor: "startTime",
                    title: "Start Time",
                    render: record => (
                      <Text>
                        {
                          record.startTime ?
                            new Date(record.startTime * 1000).toLocaleTimeString() : ""
                        }
                      </Text>
                    )
                  },
                  {
                    accessor: "endTime",
                    title: "End Time",
                    render: record => (
                      <Text>
                        {
                          record.endTime ?
                            new Date(record.endTime * 1000).toLocaleTimeString() : ""
                        }
                      </Text>
                    )
                  },
                  {
                    accessor: "actions",
                    title: "",
                    render: record => (
                      <ActionIcon
                        title="Open in Fabric Browser"
                        variant="subtle"
                        color="gray.6"
                        onClick={() => editStore.client.SendMessage({
                          options: {
                            operation: "OpenLink",
                            objectId: record._id
                          },
                          noResponse: true
                        })}
                      >
                        <IconExternalLink />
                      </ActionIcon>
                    )
                  }
                ]}
                records={Object.values(liveRecordingCopies || {})}
              />
            </Box>
          </Flex>
        </Grid.Col>
        <Grid.Col span={4}>
          <Flex>
            <Stack gap={0}>
              <div className="form__section-header">Preview</div>
              <Skeleton visible={!status} height={200} width={350}>
                {
                  (status?.state === STATUS_MAP.RUNNING && frameSegmentUrl) ?
                    <video src={frameSegmentUrl} height={200} style={{paddingRight: "32px"}}/> :
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
      <StreamPeriodsTable
        objectId={params.id}
        records={recordingInfo?.live_offering}
        title={title}
        CopyCallback={GetLiveRecordingCopies}
      />
    </>
  );
});

export default DetailsPanel;
