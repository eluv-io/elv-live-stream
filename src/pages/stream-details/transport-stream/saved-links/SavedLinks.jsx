import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Group, Text, Title, Tooltip} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {LinkIcon, PencilIcon, TrashIcon} from "@/assets/icons/index.js";
import {useState} from "react";
import {SortTable} from "@/utils/helpers.js";
import {useClipboard} from "@mantine/hooks";
import CreateSavedLink from "@/pages/stream-details/transport-stream/common/CreateSavedLink.jsx";
import EditLinkModal from "@/components/modals/EditLinkModal.jsx";

const SavedLinks = observer(({links=[], objectId, originUrl, setDeleteModalData}) => {
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "label",
    direction: "asc"
  });

  const initModalData = {
    show: false,
    url: "",
    initialValues: {
      label: "",
      region: "",
      startDate: null,
      endDate: null
    }
  };

  const [modalData, setModalData] = useState(initModalData);

  const clipboard = useClipboard();

  const records = links.sort(SortTable({sortStatus}));

  return (
    <>
      <CreateSavedLink
        objectId={objectId}
        originUrl={originUrl}
      />
      <Box className={styles.tableWrapper} mb={29}>
        {/* Table to display links */}
        <DataTable
          classNames={{header: styles.tableHeader}}
          idAccessor="label"
          records={records || []}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          minHeight={150}
          noRecordsText="No saved links found"
          columns={[
            {
              accessor: "label",
              title: "Label",
              sortable: true,
              render: (record) => (
                <Title
                  order={4}
                  lineClamp={1}
                  title={record.label}
                  miw={175}
                  c="elv-gray.9"
                >
                  {record.label || "--"}
                </Title>
              )
            },
            {
              accessor: "region",
              title: "Region",
              sortable: true,
              render: (record) => (
                <Title
                  order={4}
                  lineClamp={1}
                  title={record.region}
                  miw={175}
                  c="elv-gray.9"
                >
                  {record.region || "--"}
                </Title>
              )
            },
            {
              accessor: "dates",
              title: "Time Range",
              render: (record) => (
                <Group wrap="nowrap" gap={4}>
                  <Title
                    order={4}
                    lineClamp={1}
                    miw={175}
                    c="elv-gray.9"
                    fs={record.expired ? "italic" : ""}
                  >
                      {
                        (record.startDate && record.endDate) ?
                          (
                            <>
                              {
                                `${new Date(record.startDate).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric"
                                })} - ${new Date(record.endDate).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric"
                                })}`
                              }
                            </>
                          ) : "--"
                      }
                  </Title>
                  {
                    record.expired ? <Text c="elv-red.4" fz={14}>expired</Text> : ""
                  }
                </Group>
              )
            },
            {
              accessor: "value",
              title: "URL",
              render: (record) => (
                <Title
                  order={4}
                  lineClamp={1}
                  truncate="end"
                  title={record.value || "--"}
                  miw={100}
                  maw={350}
                  c="elv-gray.9"
                >
                  {record.value}
                </Title>
              )
            },
            {
              accessor: "actions",
              title: "",
              render: (record) => (
                <Group wrap="nowrap" gap={8}>
                  {
                    [
                      {
                        id: "edit-action",
                        label: "Edit",
                        HandleClick: () => {
                          setModalData(prevState => ({
                            ...prevState,
                            show: true,
                            url: record.value,
                            initialValues: {
                              region: record.regionValue,
                              label: record.label,
                              startDate: record.startDate,
                              endDate: record.endDate
                            }
                          }));
                        },
                        Icon: <PencilIcon color="var(--mantine-color-elv-gray-6)" height={22} width={22} />
                      },
                      {
                        id: "copy-action",
                        label: clipboard.copied ? "Copied" : "Copy",
                        HandleClick: () => clipboard.copy(record.value),
                        Icon: <LinkIcon color="var(--mantine-color-elv-gray-6)" height={22} width={22} />
                      },
                      {
                        id: "delete-action",
                        label: "Delete",
                        HandleClick: () => setDeleteModalData(prevState => ({...prevState, show: true, regionLabel: record.region, regionValue: record.regionValue, url: record.value, label: record.label})),
                        Icon: <TrashIcon color="var(--mantine-color-elv-gray-6)" height={22} width={22} />,
                        disabled: record.label.includes("Anonymous")
                      }
                    ].map(action => (
                      <Tooltip
                        label={action.label}
                        position="bottom"
                        key={action.id}
                      >
                        <ActionIcon
                          // size="xs"
                          variant="transparent"
                          color="elv-gray.5"
                          onClick={action.HandleClick}
                          disabled={action.disabled}
                        >
                          { action.Icon }
                        </ActionIcon>
                      </Tooltip>
                    ))
                  }
                </Group>
              )
            }
          ]}
        />
      </Box>

      <EditLinkModal
        show={modalData.show}
        CloseCallback={() => setModalData(prevState => ({...prevState, show: false}))}
        objectId={objectId}
        originUrl={modalData.url}
        initialValues={modalData.initialValues}
      />
    </>
  );
});

export default SavedLinks;
