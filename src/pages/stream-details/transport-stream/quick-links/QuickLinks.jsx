import {observer} from "mobx-react-lite";
import {useClipboard} from "@mantine/hooks";
import {SortTable} from "@/utils/helpers.js";
import {ActionIcon, Box, Button, Group, Select, SimpleGrid, Title, Tooltip} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {LinkIcon, PencilIcon} from "@/assets/icons/index.js";
import {useState} from "react";
import {useForm} from "@mantine/form";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {dataStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import EditLinkModal from "@/components/modals/EditLinkModal.jsx";

const QuickLinks = observer(({links=[], objectId}) => {
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "label",
    direction: "asc"
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const clipboard = useClipboard();

  const [modalData, setModalData] = useState({
    show: false,
    url: "",
    initialValues: {
      region: "",
      fabricNode: ""
    }
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      region: ""
    }
  });

  const HandleGenerateLink = async(values, removeData={}) => {
    const {region, fabricNode} = values;

    const url = await dataStore.SrtPlayoutUrl({
      objectId,
      quickLink: true,
      fabricNode,
      tokenData: {region}
    });

    await dataStore.UpdateSiteQuickLinks({
      objectId,
      url,
      region,
      removeData
    });
  };

  const records = links.sort(SortTable({sortStatus}));

  return (
    <>
      <form onSubmit={form.onSubmit(async(values) => {
        try {
          setIsSubmitting(true);
          await HandleGenerateLink(values);

          const regionLabel = FABRIC_NODE_REGIONS.find(data => data.value === values.region)?.label || "";
          notifications.show({
            title: "New link created",
            message: `Link for ${regionLabel} successfully created`
          });

          form.reset();
        } catch(_e) {
          notifications.show({
            title: "Error",
            color: "red",
            message: "Unable to create link"
          });
        } finally {
          setIsSubmitting(false);
        }
      })}>
        <SimpleGrid cols={2} spacing={150} mb={10}>
          <Box className={styles.tableWrapper}>
            {/* Form table to generate links */}
            <DataTable
              classNames={{header: styles.tableHeader}}
              records={[form]}
              columns={[
                {
                  accessor: "region",
                  title: "Add New Link",
                  titleClassName: "no-border-end",
                  render: () => (
                    <Select
                      key={form.key("region")}
                      data={
                        FABRIC_NODE_REGIONS
                          .filter(item => {
                          const activeRegions = (dataStore.srtUrlsByStream?.[objectId]?.quick_links || []).map(urlObj => urlObj.region);
                          const isDisabled = activeRegions.includes(item.value);

                          if(!isDisabled) {
                            return item;
                          }
                        })
                      }
                      placeholder="Select Region"
                      size="sm"
                      clearable
                      {...form.getInputProps("region")}
                    />
                  )
                },
                {
                  accessor: "actions",
                  textAlign: "center",
                  title: "",
                  render: () => <Button type="submit" loading={isSubmitting} disabled={!form.getValues().region}>Generate</Button>
                }
              ]}
            />
          </Box>
        </SimpleGrid>
      </form>
      <Box className={styles.tableWrapper} mb={29}>
        {/* Table to display links */}
        <DataTable
          classNames={{header: styles.tableHeader}}
          idAccessor="label"
          records={records || []}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          minHeight={records?.length > 0 ? 75 : 150}
          noRecordsText="No quick links found"
          columns={[
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
                        HandleClick: () => setModalData({
                          show: true,
                          url: record.value,
                          initialValues: {
                            region: record.regionValue,
                            regionLabel: record.region
                          }
                        }),
                        Icon: <PencilIcon color="var(--mantine-color-elv-gray-6)" height={22} width={22} />
                      },
                      {
                        id: "copy-action",
                        label: clipboard.copied ? "Copied" : "Copy",
                        HandleClick: () => clipboard.copy(record.value),
                        Icon: <LinkIcon color="var(--mantine-color-elv-gray-6)" height={22} width={22} />
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
        <EditLinkModal
          show={modalData.show}
          title="Update SRT Quick Link"
          CloseCallback={() => setModalData(prevState => ({...prevState, show: false}))}
          ConfirmCallback={async (values) => {
            try {
              await HandleGenerateLink(values, {url: modalData.url});
              notifications.show({
                title: "Link updated",
                message: `Link for ${values.region} successfully updated`
              });
            } catch(_e) {
              notifications.show({
                title: "Error",
                color: "red",
                message: "Unable to update link"
              });
            }
          }}
          objectId={objectId}
          originUrl={modalData.url}
          initialValues={modalData.initialValues}
          showLinkConfig={false}
        />
      </Box>
    </>
  );
});

export default QuickLinks;
