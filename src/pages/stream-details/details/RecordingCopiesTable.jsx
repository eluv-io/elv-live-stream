import {useState} from "react";
import {observer} from "mobx-react-lite";
import {DataTable} from "mantine-datatable";
import {ActionIcon, Box, Group, Stack, Text, Title} from "@mantine/core";
import {DateFormat, SortTable} from "@/utils/helpers";
import {editStore, streamStore} from "@/stores";
import {IconExternalLink, IconTrash} from "@tabler/icons-react";
import {useDisclosure} from "@mantine/hooks";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";

const RecordingCopiesTable = observer(({liveRecordingCopies, DeleteCallback}) => {
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
    <Box mb="24px" maw="97%">
      <Title order={3} c="elv-gray.8">Live Recording Copies</Title>
      <DataTable
        idAccessor="_id"
        noRecordsText="No live recording copies found"
        minHeight={records ? 150 : 75}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        columns={[
          {
            accessor: "title",
            title: "Title",
            sortable: true,
            render: record => (
              <Stack gap={0}>
                <Text>{record.title}</Text>
                <Text c="dimmed" fz="xs">{record._id}</Text>
              </Stack>
            )
          },
          {
            accessor: "startTime",
            title: "Start Time",
            render: record => (
              <Text>
                {
                  record.startTime ?
                    DateFormat({time: record.startTime, format: "sec"}) : ""
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
                    DateFormat({time: record.endTime, format: "sec"}) : ""
                }
              </Text>
            )
          },
          {
            accessor: "create_time",
            title: "Date Added",
            sortable: true,
            render: record => (
              <Text>
                {
                  record.create_time ?
                    DateFormat({time: record.create_time, format: "ms"}) : ""
                }
              </Text>
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
                <ActionIcon
                  title="Delete Live Recording Copy"
                  variant="subtle"
                  color="gray.6"
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
      <ConfirmModal
        show={showDeleteModal}
        title="Delete Live Recording Copy"
        confirmText="Delete"
        message="Are you sure you want to delete the live recording copy? This action cannot be undone."
        ConfirmCallback={async () => {
          await streamStore.DeleteLiveRecordingCopy({streamId: params.id, recordingCopyId: deleteId});

          setDeleteId("");
          notifications.show({
            title: "Live recording copy deleted",
            message: `${deleteId} successfully deleted`,
            autoClose: false
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
