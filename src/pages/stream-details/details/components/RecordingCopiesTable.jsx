import {useState} from "react";
import {observer} from "mobx-react-lite";
import {DataTable} from "mantine-datatable";
import {ActionIcon, Box, Group, Stack, Text, Title} from "@mantine/core";
import {DateFormat, SortTable} from "@/utils/helpers.js";
import {streamStore} from "@/stores/index.js";
import {IconExternalLink, IconTrash} from "@tabler/icons-react";
import {useDisclosure} from "@mantine/hooks";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import styles from "../../../streams/Streams.module.css";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const RecordingCopiesTable = observer(({liveRecordingCopies, DeleteCallback, loading}) => {
  const [showDeleteModal, {open, close}] = useDisclosure(false);
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "title",
    direction: "asc"
  });
  const [deleteId, setDeleteId] = useState("");
  const params = useParams();

  const records = Object.values(liveRecordingCopies || {})
    .sort(SortTable({sortStatus}));

  return (
    <Box mb="24px" maw="100%">
      <SectionTitle mb={7}>Live Recording Copies</SectionTitle>
      <Box className={styles.tableWrapper}>
        <DataTable
          idAccessor="_id"
          noRecordsText="No live recording copies found"
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          highlightOnHover
          fetching={loading}
          minHeight={(!records || records.length === 0) ? 130 : 75}
          columns={[
            {
              accessor: "title",
              title: "Title",
              sortable: true,
              render: record => (
                <Stack gap={0}>
                  <Title order={3} c="elv-gray.9">{record.title}</Title>
                  <Text c="dimmed" fz={12}>{record._id}</Text>
                </Stack>
              )
            },
            {
              accessor: "startTime",
              title: "Start Time",
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  {
                    record.startTime ?
                      DateFormat({time: record.startTime, format: "sec"}) : ""
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "endTime",
              title: "End Time",
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  {
                    record.endTime ?
                      DateFormat({time: record.endTime, format: "sec"}) : ""
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "create_time",
              title: "Date Added",
              sortable: true,
              render: record => (
                <BasicTableRowText style={{wordBreak: "break-word"}}>
                  {
                    record.create_time ?
                      DateFormat({time: record.create_time, format: "ms"}) : ""
                  }
                </BasicTableRowText>
              )
            },
            {
              accessor: "actions",
              title: "",
              render: record => (
                <Group>
                  <ActionIcon
                    title="Open in Fabric Browser"
                    variant="subtle"
                    color="elv-gray.6"
                    onClick={() => streamStore.client.SendMessage({
                      options: {
                        operation: "OpenLink",
                        objectId: record._id
                      },
                      noResponse: true
                    })}
                  >
                    <IconExternalLink />
                  </ActionIcon>
                  <ActionIcon
                    title="Delete Live Recording Copy"
                    variant="subtle"
                    color="elv-gray.6"
                    onClick={() => {
                      open();
                      setDeleteId(record._id);
                    }}
                  >
                    <IconTrash />
                  </ActionIcon>
                </Group>
              )
            }
          ]}
          records={records}
        />
      </Box>
      <ConfirmModal
        show={showDeleteModal}
        title="Delete Live Recording Copy"
        confirmText="Delete"
        message="Are you sure you want to delete the live recording copy? This action cannot be undone."
        danger
        ConfirmCallback={async () => {
          await streamStore.DeleteLiveRecordingCopy({streamId: params.id, recordingCopyId: deleteId});

          setDeleteId("");
          notifications.show({
            title: "Live recording copy deleted",
            message: <NotificationMessage>Successfully deleted {deleteId}</NotificationMessage>
          });

          DeleteCallback();

          close();
        }}
        CloseCallback={close}
      />
    </Box>
  );
});

export default RecordingCopiesTable;
