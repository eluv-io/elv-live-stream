import {useState} from "react";
import {observer} from "mobx-react-lite";
import {useDisclosure} from "@mantine/hooks";
import {streamEditStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import {RECORDING_STATUS_TEXT, RETENTION_TEXT, STATUS_MAP} from "@/utils/constants.js";
import {Box, Button, Checkbox, Divider, Flex, Group, SimpleGrid, Stack, Text} from "@mantine/core";
import {
  DateFormat,
  Pluralize,
  RecordingPeriodIsExpired,
  RelativeTime,
  SortTable,
  StreamIsActive
} from "@/utils/helpers.js";
import {DataTable} from "mantine-datatable";
import CopyToVodModal from "@/pages/streams/details/summary/components/CopyToVodModal.jsx";
import {Runtime} from "@/pages/streams/details/summary/SummaryPanel.jsx";
import {BasicTableRowText} from "@/pages/streams/details/common/DetailsCommon.jsx";
import sharedStyles from "@/assets/shared.module.css";
import styles from "./RecordingPeriodsTable.module.css";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const RecordingPeriodsTable = observer(({
  records,
  objectId,
  title,
  CopyCallback,
  currentTimeMs,
  retention,
  persistent,
  loading,
  status
}) => {
  const [selectedRecords, setSelectedRecords] = useState([]);

  const [copyingToVod, setCopyingToVod] = useState(false);
  const [showCopyModal, {open, close}] = useDisclosure(false);
  const [vodTitle, setVodTitle] = useState(`${title} VoD`);
  const [vodLibraryId, setVodLibraryId] = useState("");
  const [vodAccessGroup, setVodAccessGroup] = useState(null);

  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "start_time",
    direction: "desc"
  });

  const [showExpired, setShowExpired] = useState(false);

  const HandleCopy = async ({title}) => {
    try {
      setCopyingToVod(true);
      const response = await streamEditStore.CopyToVod({
        objectId,
        targetLibraryId: vodLibraryId,
        accessGroup: vodAccessGroup,
        selectedPeriods: selectedRecords,
        title
      });

      await CopyCallback();

      notifications.show({
        title: <NotificationMessage>Copied to VoD: {title || objectId}</NotificationMessage>,
        message: <NotificationMessage>Successfully created {response?.target_object_id}</NotificationMessage>,
        autoClose: false
      });
      close();
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to copy to VoD"
      });

      // eslint-disable-next-line no-console
      console.error("Unable to copy to VoD", error);
      setCopyingToVod(false);
      close();
    } finally {
      setCopyingToVod(false);
    }
  };

  const RecordingStatus = ({item, text=true, startTime, endTime}) => {
    let status;
    const videoIsEmpty = (item?.sources?.video?.parts || []).length === 0;

    if(
      RecordingPeriodIsExpired({
        parts: item?.sources?.video?.parts || [],
        startTime,
        endTime,
        retention: parseInt(retention)
      })
    ) {
      status = "EXPIRED";
    } else if(!videoIsEmpty && item?.sources?.video?.trimmed > 0) {
      status = "PARTIALLY_AVAILABLE";
    } else {
      status = "AVAILABLE";
    }

    return text ? RECORDING_STATUS_TEXT[status] : status;
  };

  const ExpirationTime = ({startTime, retention, persistent}) => {
    if(!startTime) { return "--"; }

    const retentionTime = persistent ? 0 : (parseInt(retention || "") * 1000);

    const expirationTimeMs = (startTime * 1000) + retentionTime;

    return expirationTimeMs ?
      DateFormat({
        time: expirationTimeMs,
        format: "ms"
      }) : "--";
  };

  const filteredRecords = (records || [])
    .sort(SortTable({sortStatus}))
    .filter((record, i) => {
      const expired = RecordingPeriodIsExpired({
        parts: record?.sources?.video?.parts || [],
        startTime: record.start_time,
        endTime: record.end_time,
        retention: parseInt(retention)
      });

      if(showExpired) {
        return true;
      } else {
        if(i === 0) { return record; }
        return !expired;
      }
    });
  const isDisconnected = !!records?.[0]?.end_time || !StreamIsActive(status);

  const periodsSummaryData = [
    {label: "Status", id: "period-status", value: isDisconnected ? "Disconnected" : "Recording"},
    {label: "Last Start", id: "period-last-start", value: status?.recordingPeriod?.startTimeEpochSec ? DateFormat({time: status?.recordingPeriod?.startTimeEpochSec, format: "sec"}) : ""},
    {label: "Runtime", id: "period-runtime", value: [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state) ? Runtime({startTime: status?.recordingPeriod?.startTimeEpochSec * 1000, currentTimeMs, active: true, format: "hh:mm:ss"}) : ""},
    {label: "Last Incident", id: "period-last-incident", value: RelativeTime(records?.[1]?.end_time)},
    {label: "Periods", id: "period-count", value: (records || []).length},
    {label: "Retention", id: "period-retention", value: retention ? RETENTION_TEXT[retention] : ""},
  ];

  return (
    <>
      <Group mb={16} w="100%" align="flex-end">
        <SectionTitle>Recording Periods</SectionTitle>
        <Flex align="center" ml="auto">
          <Text mr={16} fz="0.875rem">
            {
              selectedRecords.length === 0 ? "" : `${Pluralize({base: "item", count: selectedRecords.length})} selected`
            }
          </Text>
          <Button
            disabled={selectedRecords.length === 0 || copyingToVod}
            onClick={open}
            size="sm"
            loading={copyingToVod}
          >
            Copy to VoD
          </Button>
        </Flex>
      </Group>
      <Box maw="100%" p={12} className={sharedStyles.tableWrapper} mb={16}>
          <Text fz="0.875rem" c="elv-gray.7" fw={600}>Recording Info</Text>
          <Divider color="elv-gray.2" />
          <SimpleGrid cols={6}>
            {
              periodsSummaryData.map((item) => (
                <Stack key={item.id} gap={4} className={styles.summaryItem} pt={7}>
                  <Text fz="0.75rem" fw={400} c="elv-gray.7">{ item.label }</Text>
                  <Text fz="0.875rem" fw={600} c="elv-gray.9">{ item.value }</Text>
                </Stack>
              ))
            }
          </SimpleGrid>
        </Box>

      <Box className={sharedStyles.tableWrapper} mb="4rem">
        <DataTable
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          fetching={loading}
          columns={[
            {
              accessor: "start_time",
              title: "Start Time",
              sortable: true,
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  {
                    record.start_time ?
                      DateFormat({time: record.start_time, format: "iso"}) : "--"
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "end_time",
              title: "End Time",
              sortable: true,
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  {
                    record.end_time ?
                      DateFormat({time: record.end_time, format: "iso"}) : "--"
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "runtime",
              title: "Runtime",
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  {
                    record.start_time ?
                      Runtime({
                        startTime: new Date(record.start_time).getTime(),
                        endTime: new Date(record.end_time).getTime(),
                        currentTimeMs,
                        format: "hh:mm:ss",
                        active: RecordingStatus({
                          item: record,
                          text: false,
                          startTime: record.start_time,
                          endTime: record.end_time
                        }) !== "EXPIRED"
                      }) : "--"
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "expiration_time",
              title: "Expiration Time",
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  <ExpirationTime startTime={record?.start_time_epoch_sec} retention={retention} persistent={persistent} />
                </BasicTableRowText>
              )
            },
            {
              accessor: "status",
              title: "Status",
              render: record => (
                <BasicTableRowText>
                  {RecordingStatus({
                    item: record,
                    startTime: record.start_time,
                    endTime: record.end_time
                  })}
                </BasicTableRowText>
              ),
              filter: () => (
                <Checkbox
                  label="Expired Entries"
                  description="Show expired recording periods"
                  checked={showExpired}
                  onChange={() => {
                    setShowExpired((current) => !current);
                  }}
                />
              )
            }
          ]}
          minHeight={(!filteredRecords || filteredRecords.length === 0) ? 130 : 75}
          noRecordsText="No recording periods found"
          records={filteredRecords}
          selectionColumnClassName={sharedStyles.selectionColumn}
          selectedRecords={selectedRecords}
          onSelectedRecordsChange={setSelectedRecords}
          isRecordSelectable={(record) => (
            RecordingStatus({
              item: record,
              text: false,
              startTime: record.start_time,
              endTime: record.end_time
            }) === "AVAILABLE"
          )}
          highlightOnHover
        />
      </Box>
      <CopyToVodModal
        show={showCopyModal}
        close={close}
        Callback={(title) => HandleCopy({title})}
        title={vodTitle}
        setTitle={setVodTitle}
        libraryId={vodLibraryId}
        setLibraryId={setVodLibraryId}
        accessGroup={vodAccessGroup}
        setAccessGroup={setVodAccessGroup}
      />
    </>
  );
});

export default RecordingPeriodsTable;

