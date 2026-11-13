import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {DataTable} from "mantine-datatable";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import {DateFormat} from "@/utils/formatters.ts";
import {SortTable} from "@/utils/helpers.ts";
import {streamStatusStore, recordingCopyStore} from "@/stores/index.ts";
import {RecordingCopyMissingError} from "@/stores/streams/RecordingCopyStore.ts";
import {IconCircleX, IconExternalLink, IconPencil, IconCopy} from "@tabler/icons-react";
import {useDisclosure} from "@mantine/hooks";
import {useForm} from "@mantine/form";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";
import {BasicTableRowText} from "@/pages/streams/details/common/DetailsCommon.jsx";
import sharedStyles from "@/assets/shared.module.css";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import BatchActions from "@/components/table/batch-actions/BatchActions.jsx";

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

const PAGE_SIZE = 15;
// Fixed when paginated so pages don't resize
const PAGED_ROW_HEIGHT = 52;
const TABLE_HEADER_HEIGHT = 45;

const BlankPlaceholders = columns => columns.map(column => ({
  ...column,
  render: record => record.placeholder ? null : column.render(record)
}));

const RecordingCopiesTable = observer(({liveRecordingCopies, DeleteCallback, EditCallback, loading}) => {
  const [showDeleteModal, {open, close}] = useDisclosure(false);
  const [showEditModal, {open: openEdit, close: closeEdit}] = useDisclosure(false);
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "title",
    direction: "asc"
  });
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBatchModal, {open: openBatch, close: closeBatch}] = useDisclosure(false);
  const [editRecord, setEditRecord] = useState(null);
  const [showDuplicateModal, {open: openDuplicate, close: closeDuplicate}] = useDisclosure(false);
  const params = useParams();

  const sortedRecords = Object.values(liveRecordingCopies || {})
    .sort(SortTable({sortStatus}));

  // Pagination state
  const [page, setPage] = useState(1);
  const pageRecords = sortedRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paginated = sortedRecords.length > PAGE_SIZE;
  const records = paginated ?
    [
      ...pageRecords,
      ...Array.from({length: PAGE_SIZE - pageRecords.length}, (_, i) => ({_id: `placeholder-${i}`, placeholder: true}))
    ] :
    pageRecords;

  const selectedRecords = sortedRecords.filter(r => selectedIds.includes(r._id));

  return (
    <Box mb="24px" maw="100%">
      <Flex direction="row" mb={7} align="center">
        <SectionTitle>Recordings</SectionTitle>
        <BatchActions
          mb={0}
          ml="auto"
          selectedRecords={selectedRecords}
          allSelected={sortedRecords.length > 0 && selectedRecords.length === sortedRecords.length}
          selectAllDisabled={loading}
          SelectAll={() => setSelectedIds(
            selectedRecords.length === sortedRecords.length ? [] : sortedRecords.map(r => r._id)
          )}
          actions={[
            {
              id: "remove",
              label: "Remove From List",
              icon: IconCircleX,
              disabled: selectedRecords.length === 0,
              onClick: openBatch
            },
            {
              id: "duplicate",
              label: "Duplicate",
              icon: IconCopy,
              disabled: selectedRecords.length === 0 || selectedRecords.some(r => r.unavailable),
              onClick: openDuplicate
            }
          ]}
        />
      </Flex>
      <Box className={`${sharedStyles.tableWrapper} ${sharedStyles.fixedTable}`}>
        <DataTable
          idAccessor="_id"
          noRecordsText="No live recording copies found"
          sortStatus={sortStatus}
          onSortStatusChange={(status) => {
            setSortStatus(status);
            setPage(1);
          }}
          highlightOnHover
          selectedRecords={selectedRecords}
          onSelectedRecordsChange={rows => setSelectedIds(rows.map(r => r._id))}
          isRecordSelectable={record => !record.placeholder}
          fetching={loading}
          totalRecords={sortedRecords.length}
          recordsPerPage={PAGE_SIZE}
          page={page}
          onPageChange={(p) => setPage(p)}
          minHeight={
            sortedRecords.length > PAGE_SIZE ?
              TABLE_HEADER_HEIGHT + PAGE_SIZE * PAGED_ROW_HEIGHT :
              (records.length === 0 ? 130 : 75)
          }
          rowStyle={record => paginated ? {height: PAGED_ROW_HEIGHT, ...(record.placeholder && {pointerEvents: "none"})} : undefined}
          columns={BlankPlaceholders([
            {
              accessor: "title",
              title: "Title",
              sortable: true,
              render: record => (
                <Stack gap={0}>
                  <Group gap="xs" align="center">
                    <Title order={3} c="elv-gray.9">{record.title}</Title>
                    {
                      record.unavailable &&
                      <Badge color="elv-red.1" variant="light" size="sm">Unavailable</Badge>
                    }
                  </Group>
                  <Text c="dimmed" fz={12}>{record._id}</Text>
                </Stack>
              )
            },
            {
              accessor: "startTime",
              title: "Start Time",
              width: 190,
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
              width: 190,
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
              width: 190,
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
              width: 140,
              render: record => (
                <Group>
                  <Tooltip label="Edit Name" position="bottom">
                    <ActionIcon
                      variant="subtle"
                      color="elv-gray.6"
                      disabled={record.unavailable}
                      onClick={() => {
                        setEditRecord(record);
                        openEdit();
                      }}
                    >
                      <IconPencil />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Open in Fabric Browser" position="bottom">
                    <ActionIcon
                      variant="subtle"
                      color="elv-gray.6"
                      disabled={record.unavailable}
                      onClick={() => streamStatusStore.client.SendMessage({
                        options: {
                          operation: "OpenLink",
                          objectId: record._id
                        },
                        noResponse: true
                      })}
                    >
                      <IconExternalLink />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Remove From List" position="bottom">
                    <ActionIcon
                      variant="subtle"
                      color="elv-gray.6"
                      onClick={() => {
                        setDeleteRecord(record);
                        open();
                      }}
                    >
                      <IconCircleX />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )
            }
          ])}
          records={records}
        />
      </Box>
      <ConfirmModal
        show={showDeleteModal}
        title="Remove Live Recording Copy Confirmation"
        confirmText="Remove from List"
        message={
          deleteRecord?.unavailable ?
            "This recording no longer exists on the Fabric. Are you sure you want to remove it from the stream?" :
            "Are you sure you want to remove this recording from the stream? The VOD object itself will not be deleted."
        }
        detailData={{
          idKey: "Object ID:",
          id: deleteRecord?._id
        }}
        danger
        ConfirmCallback={async () => {
          await recordingCopyStore.DeleteLiveRecordingCopy({streamId: params.id, recordingCopyId: deleteRecord._id});

          notifications.show({
            title: "Live recording copy removed",
            message: <NotificationMessage>Successfully removed {deleteRecord._id}</NotificationMessage>
          });

          close();
          DeleteCallback();
          setDeleteRecord(null);
        }}
        CloseCallback={close}
      />
      <ConfirmModal
        show={showBatchModal}
        title="Remove Live Recording Copies Confirmation"
        confirmText="Remove from List"
        message={`Are you sure you want to remove ${selectedRecords.length} recording${selectedRecords.length === 1 ? "" : "s"} from the stream? The VOD objects themselves will not be deleted.`}
        danger
        ConfirmCallback={async () => {
          const ids = selectedRecords.map(r => r._id);
          await recordingCopyStore.DeleteLiveRecordingCopies({streamId: params.id, recordingCopyIds: ids});

          notifications.show({
            title: "Live recording copies removed",
            message: <NotificationMessage>Successfully removed {ids.length} recording{ids.length === 1 ? "" : "s"}</NotificationMessage>
          });

          closeBatch();
          setSelectedIds([]);
          DeleteCallback();
        }}
        CloseCallback={closeBatch}
      />
      <ConfirmModal
        show={showDuplicateModal}
        title="Duplicate Live Recording Copies Confirmation"
        confirmText="Duplicate"
        message={`Are you sure you want to duplicate ${selectedRecords.length} recording${selectedRecords.length === 1 ? "" : "s"}? Each copy will be added to this stream's recordings.`}
        ConfirmCallback={async () => {
          const ids = selectedRecords.map(r => r._id);
          await recordingCopyStore.DuplicateLiveRecordingCopies({streamId: params.id, recordingCopyIds: ids});

          notifications.show({
            title: "Live recording duplicated",
            message: <NotificationMessage>Successfully duplicated {ids.length} recording{ids.length === 1 ? "" : "s"}</NotificationMessage>
          });

          setSelectedIds([]);
          if(EditCallback) {
            EditCallback();
          }
        }}
        CloseCallback={closeDuplicate}
      />
      <EditModal
        show={showEditModal}
        record={editRecord}
        CloseCallback={() => {
          closeEdit();
          setEditRecord(null);
        }}
        ConfirmCallback={async ({title}) => {
          try {
            await recordingCopyStore.EditLiveRecordingCopy({
              streamId: params.id,
              recordingCopyId: editRecord._id,
              title
            });
          } catch(error) {
            // The copy was deleted between table load and this edit. Let the
            // edit modal close cleanly and offer to remove the stale entry
            // instead of surfacing a raw error.
            if(error instanceof RecordingCopyMissingError) {
              setDeleteRecord({...editRecord, unavailable: true});
              open();
              return;
            }

            throw error;
          }

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
