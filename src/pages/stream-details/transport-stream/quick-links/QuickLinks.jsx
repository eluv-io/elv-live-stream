import {observer} from "mobx-react-lite";
import {useClipboard} from "@mantine/hooks";
import {SortTable} from "@/utils/helpers.js";
import {ActionIcon, Box, Button, Group, Select, SimpleGrid, Title, Tooltip} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {LinkIcon, TrashIcon} from "@/assets/icons/index.js";
import {useState} from "react";
import {useForm} from "@mantine/form";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {dataStore} from "@/stores/index.js";

const QuickLinks = observer(({links=[], setModalData, objectId}) => {
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "label",
    direction: "asc"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clipboard = useClipboard();

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      region: ""
    }
  });

  const HandleGenerate = () => {
    try {
      setIsSubmitting(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const records = links.sort(SortTable({sortStatus}));

  return (
    <>
      <form onSubmit={form.onSubmit(HandleGenerate)}>
        <SimpleGrid cols={2} spacing={150} mb={10}>
          <Box className={styles.tableWrapper}>
            {/* Form table to generate links */}
            <DataTable
              classNames={{header: styles.tableHeader}}
              records={[form]}
              columns={[
                {
                  accessor: "region",
                  title: "Region",
                  titleClassName: "no-border-end",
                  render: () => (
                    <Select
                      key={form.key("region")}
                      data={
                        FABRIC_NODE_REGIONS.filter(item => {
                          const activeRegions = (dataStore.srtUrlsByStream?.[objectId]?.srt_urls || []).map(urlObj => urlObj.region);
                          const isDisabled = activeRegions.includes(item.value);

                          if(!isDisabled) {
                            return item;
                          }
                        })
                      }
                      placeholder="Select Region"
                      size="sm"
                      {...form.getInputProps("region")}
                    />
                  )
                },
                {
                  accessor: "actions",
                  textAlign: "center",
                  title: "",
                  render: () => <Button type="submit" loading={isSubmitting}>Generate</Button>
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
          minHeight={150}
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
                        id: "copy-action",
                        label: clipboard.copied ? "Copied" : "Copy",
                        HandleClick: () => clipboard.copy(record.value),
                        Icon: <LinkIcon color="var(--mantine-color-elv-gray-7)" height={22} width={22} />
                      },
                      {
                        id: "delete-action",
                        label: "Delete",
                        HandleClick: () => setModalData(prevState => ({...prevState, show: true, regionLabel: record.region, regionValue: record.regionValue, url: record.value, label: record.label})),
                        Icon: <TrashIcon color="var(--mantine-color-elv-gray-7)" height={22} width={22} />,
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
    </>
  );
});

export default QuickLinks;
