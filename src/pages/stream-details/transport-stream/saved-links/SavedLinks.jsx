import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Group, Text, Title, Tooltip} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {LinkIcon, PencilIcon, TrashIcon} from "@/assets/icons/index.js";
import {useState} from "react";
import {SortTable} from "@/utils/helpers.js";
import {useClipboard} from "@mantine/hooks";
import SrtLinkForm from "@/pages/stream-details/transport-stream/common/SrtLinkForm.jsx";
import EditLinkModal from "@/components/modals/EditLinkModal.jsx";
import {dataStore} from "@/stores/index.js";

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

  const [formData, setFormData] = useState({
    region: "",
    label: "",
    useSecure: true,
    startDate: new Date(),
    endDate: null
  });

  const [modalData, setModalData] = useState(initModalData);
  const clipboard = useClipboard();

  const HandleFormChange = ({key, value}) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const HandleGenerateLink = async(values, removeData={}) => {
    const {label, useSecure, region, startDate, endDate, fabricNode} = values;
    const issueTime = startDate ? new Date(startDate) : new Date();
    const futureDate = new Date(issueTime.getTime() + 14 * 24 * 60 * 60 * 1000); // Add 2 weeks

    const url = await dataStore.SrtPlayoutUrl({
      objectId,
      originUrl,
      fabricNode,
      tokenData: {
        expirationTime: endDate ? new Date(endDate).getTime() : (futureDate.getTime()),
        issueTime: issueTime.getTime(),
        label,
        useSecure,
        region
      }
    });

    await dataStore.UpdateSiteSrtLinks({objectId, url, region, label, removeData});

    // Reset region since one link per region is allowed
    HandleFormChange({key: "region", value: ""});
  };

  const records = links.sort(SortTable({sortStatus}));

  return (
    <>
      <SrtLinkForm
        objectId={objectId}
        originUrl={originUrl}
        HandleGenerateLink={() => HandleGenerateLink(formData)}
        HandleFormChange={HandleFormChange}
        formData={formData}
      />
      <Box className={styles.tableWrapper} mb={29}>
        {/* Table to display links */}
        <DataTable
          classNames={{header: styles.tableHeader}}
          idAccessor="label"
          records={records || []}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          minHeight={records?.length > 0 ? 75 : 150}
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
                <Group wrap="nowrap" gap={4} align="flex-end">
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
                    record.expired ? <Text c="elv-red.4" fz={14} fs="italic">expired</Text> : ""
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
                        HandleClick: () => setDeleteModalData(prevState => ({
                          ...prevState,
                          show: true,
                          regionLabel: record.region,
                          regionValue: record.regionValue,
                          url: record.value,
                          label: record.label
                        })),
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
        ConfirmCallback={async (values) => {
          await HandleGenerateLink(values, {url: modalData.url});
        }}
        objectId={objectId}
        originUrl={modalData.url}
        initialValues={modalData.initialValues}
      />
    </>
  );
});

export default SavedLinks;
