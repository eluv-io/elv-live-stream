import {useState} from "react";
import {observer} from "mobx-react-lite";
import {useDisclosure} from "@mantine/hooks";
import {streamStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import {RECORDING_STATUS_TEXT} from "@/utils/constants.js";
import {Box, Button, Flex, Group, Text} from "@mantine/core";
import {DateFormat, Pluralize, SortTable} from "@/utils/helpers.js";
import {DataTable} from "mantine-datatable";
import DetailsCopyModal from "@/pages/stream-details/details/components/CopyToVodModal.jsx";
import {Runtime} from "@/pages/stream-details/details/DetailsPanel.jsx";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import styles from "../../../streams/Streams.module.css";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

const RecordingPeriodsTable = observer(({
  records,
  objectId,
  libraryId,
  title,
  CopyCallback,
  currentTimeMs,
  retention,
  loading
}) => {
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [copyingToVod, setCopyingToVod] = useState(false);
  const [showCopyModal, {open, close}] = useDisclosure(false);
  const [vodTitle, setVodTitle] = useState(`${title} VoD`);
  const [vodLibraryId, setVodLibraryId] = useState(libraryId);
  const [vodAccessGroup, setVodAccessGroup] = useState(null);
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "end_time",
    direction: "asc"
  });

  const HandleCopy = async ({title}) => {
    try {
      setCopyingToVod(true);
      const response = await streamStore.CopyToVod({
        objectId,
        targetLibraryId: vodLibraryId,
        accessGroup: vodAccessGroup,
        selectedPeriods: selectedRecords,
        title
      });

      await CopyCallback();

      notifications.show({
        title: `${title || objectId} copied to VoD`,
        message: `${response?.target_object_id} successfully created`,
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
      videoIsEmpty ||
      !MeetsDurationMin({startTime, endTime}) ||
      !IsWithinRetentionPeriod({startTime})
    ) {
      status = "EXPIRED";
    } else if(!videoIsEmpty && item?.sources?.video?.trimmed > 0) {
      status = "PARTIALLY_AVAILABLE";
    } else {
      status = "AVAILABLE";
    }

    return text ? RECORDING_STATUS_TEXT[status] : status;
  };

  const MeetsDurationMin = ({startTime, endTime}) => {
    startTime = new Date(startTime).getTime();
    endTime = new Date(endTime).getTime();

    // If starting or currently running, part is copyable
    if(endTime === 0 || startTime === 0) { return true; }

    return (endTime - startTime) >= 61000;
  };

  const IsWithinRetentionPeriod = ({startTime}) => {
    const currentTimeMs = new Date().getTime();
    const startTimeMs = new Date(startTime).getTime();
    const retentionMs = retention * 1000;

    if(typeof startTimeMs !== "number") { return false; }

    return (currentTimeMs - startTimeMs) < retentionMs;
  };

  const ExpirationTime = ({startTime, retention}) => {
    if(!startTime) { return "--"; }

    const expirationTimeMs = (startTime * 1000) + (retention * 1000);

    return expirationTimeMs ?
      DateFormat({
        time: expirationTimeMs,
        format: "ms"
      }) : "--";
  };

  records = (records || []).sort(SortTable({sortStatus}));

  return (
    <>
      <Group mb={7} w="100%" align="flex-end">
        <SectionTitle>Recording Periods</SectionTitle>
        <Flex align="center" ml="auto">
          <Text mr={16}>
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

      <Box className={styles.tableWrapper}>
        <DataTable
          mb="4rem"
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          fetching={loading}
          columns={[
            {
              accessor: "start_time",
              title: "Start Time",
              sortable: true,
              render: record => (
                <BasicTableRowText>
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
                <BasicTableRowText>
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
                <BasicTableRowText>
                  {
                    record.start_time ?
                      Runtime({
                        startTime: new Date(record.start_time).getTime(),
                        endTime: new Date(record.end_time).getTime(),
                        currentTimeMs,
                        format: "hh:mm:ss"
                      }) : "--"
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "expiration_time",
              title: "Expiration Time",
              render: record => (
                <BasicTableRowText>
                  <ExpirationTime startTime={record?.start_time_epoch_sec} retention={retention} />
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
              )
            }
          ]}
          minHeight={!records || records.length === 0 ? 150 : 75}
          noRecordsText="No recording periods found"
          records={records}
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
      <DetailsCopyModal
        show={showCopyModal}
        close={() => {
          setVodLibraryId(libraryId);
          setVodAccessGroup(null);
          close();
        }}
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

