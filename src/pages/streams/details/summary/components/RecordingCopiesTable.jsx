import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {DataTable} from "mantine-datatable";
import {ActionIcon, Box, Button, Flex, Group, Modal, Stack, Text, TextInput, Title} from "@mantine/core";
import {DateFormat} from "@/utils/formatters.ts";
import {SortTable} from "@/utils/helpers.ts";
import {streamStore, streamEditStore} from "@/stores/index.ts";
import {IconExternalLink, IconPencil, IconTrash} from "@tabler/icons-react";
import {useDisclosure} from "@mantine/hooks";
import {useForm} from "@mantine/form";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";
import {BasicTableRowText} from "@/pages/streams/details/common/DetailsCommon.jsx";
import sharedStyles from "@/assets/shared.module.css";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const EditModal = observer(({show, record, CloseCallback, ConfirmCallback}) => {
  const [saving, setSaving] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      title: record?.title || ""
    },
    validate: {
      title: value => value.trim().length === 0 ? "Name is required" : null
    }
  });

  useEffect(() => {
    if(show) {
      form.setValues({title: record?.title || ""});
      form.resetDirty({title: record?.title || ""});
    }
  }, [show, record?._id]);

  const HandleSubmit = async ({title}) => {
    try {
      setSaving(true);
      await ConfirmCallback({title: title.trim()});
      CloseCallback();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={show}
      onClose={CloseCallback}
      title="Edit Recording Name"
      padding="24px"
      radius="6px"
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <TextInput
          label="Title"
          placeholder="Enter recording copy title"
          key={form.key("title")}
          {...form.getInputProps("title")}
        />
        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end" gap="sm">
          <Button variant="outline" onClick={CloseCallback} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={saving || !form.isDirty()}>Save</Button>
        </Flex>
      </form>
    </Modal>
  );
});

const RecordingCopiesTable = observer(({liveRecordingCopies, DeleteCallback, EditCallback, loading}) => {
  const [showDeleteModal, {open, close}] = useDisclosure(false);
  const [showEditModal, {open: openEdit, close: closeEdit}] = useDisclosure(false);
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "title",
    direction: "asc"
  });
  const [deleteId, setDeleteId] = useState("");
  const [editRecord, setEditRecord] = useState(null);
  const params = useParams();

  const records = Object.values(liveRecordingCopies || {})
    .sort(SortTable({sortStatus}));

  return (
    <Box mb="24px" maw="100%">
      <SectionTitle mb={7}>Recordings</SectionTitle>
      <Box className={sharedStyles.tableWrapper}>
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
                    title="Edit Name"
                    variant="subtle"
                    color="elv-gray.6"
                    onClick={() => {
                      setEditRecord(record);
                      openEdit();
                    }}
                  >
                    <IconPencil />
                  </ActionIcon>
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
        title="Delete Live Recording Copy Confirmation"
        confirmText="Delete Copy"
        message="Are you sure you want to delete the live recording copy?"
        detailData={{
          idKey: "Live Recording Copy ID:",
          id: deleteId
        }}
        danger
        ConfirmCallback={async () => {
          await streamEditStore.DeleteLiveRecordingCopy({streamId: params.id, recordingCopyId: deleteId});

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
      <EditModal
        show={showEditModal}
        record={editRecord}
        CloseCallback={() => {
          closeEdit();
          setEditRecord(null);
        }}
        ConfirmCallback={async ({title}) => {
          await streamEditStore.EditLiveRecordingCopy({
            streamId: params.id,
            recordingCopyId: editRecord._id,
            title
          });

          notifications.show({
            title: "Live recording copy updated",
            message: <NotificationMessage>Successfully updated {editRecord._id}</NotificationMessage>
          });

          if(EditCallback) {
            EditCallback();
          }
        }}
      />
    </Box>
  );
});

export default RecordingCopiesTable;
