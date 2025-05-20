import {observer} from "mobx-react-lite";
import {useForm} from "@mantine/form";
import {dataStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import {ActionIcon, Box, Button, Group, Select, Text, TextInput, Title, Tooltip} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {DateTimePicker} from "@mantine/dates";
import {CalendarMonthIcon, LinkIcon, TrashIcon} from "@/assets/icons/index.js";
import {IconSelector} from "@tabler/icons-react";
import {useState} from "react";
import {SortTable} from "@/utils/helpers.js";
import {useClipboard} from "@mantine/hooks";

const SavedLinks = observer(({links=[], objectId, originUrl, setModalData}) => {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      region: "",
      label: "",
      useSecure: true,
      startDate: new Date(), // controlled
      endDate: null // controlled
    }
  });

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortStatus, setSortStatus] = useState({
    columnAccessor: "label",
    direction: "asc"
  });

  const clipboard = useClipboard();

  const HandleSubmit = async(values) => {
    try {
      const currentDate = new Date();
      const futureDate = new Date(currentDate.getFullYear() + 100, currentDate.getMonth(), currentDate.getDate());
      setIsSubmitting(true);

      const {label, useSecure, region} = values;

      const url = await dataStore.SrtPlayoutUrl({
        objectId,
        originUrl,
        tokenData: {
          expirationTime: endDate ? endDate.getTime() : (futureDate.getTime()),
          issueTime: startDate ? startDate.getTime() : currentDate.getTime(),
          label,
          useSecure,
          region
        }
      });

      await dataStore.UpdateSiteObject({objectId, url, region, label});

      notifications.show({
        title: "New link created",
        message: `Link for ${region} successfully created`,
        autoClose: false
      });

      // Reset region since one link per region is allowed
      form.setFieldValue("region", "");
    } catch(_e) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to create link"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const records = links.sort(SortTable({sortStatus}));

  return (
    <>
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <Box className={styles.tableWrapper} mb={29}>
          {/* Form table to generate links */}
          <DataTable
            classNames={{header: styles.tableHeader}}
            records={[form]}
            minHeight={75}
            columns={[
              {
                accessor: "label",
                title: "Label",
                titleClassName: "no-border-end",
                placeholder: "Enter a Label",
                render: () => (
                  <TextInput
                    key={form.key("label")}
                    {...form.getInputProps("label")}
                  />
                )
              },
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
                    clearable
                    {...form.getInputProps("region")}
                  />
                )
              },
              // {
              //   accessor: "useSecure",
              //   render: () => (
              //     <Checkbox
              //       value={form.key("useSecure")}
              //       {...form.getInputProps("useSecure", {type: "checkbox"})}
              //     />
              //   )
              // }
              {
                accessor: "dates",
                title: "Time Range",
                titleClassName: "no-border-end",
                render: () => (
                  <Group>
                    <DateTimePicker
                      value={startDate}
                      onChange={setStartDate}
                      valueFormat="MM/DD/YY HH:mm A"
                      size="sm"
                      minDate={new Date()}
                      defaultValue={new Date()}
                      miw={175}
                      clearable
                      placeholder="Start"
                      timePickerProps={{
                        withDropdown: true,
                        popoverProps: { withinPortal: false },
                        format: "12h",
                      }}
                      leftSection={<CalendarMonthIcon />}
                      rightSection={startDate ? null : <IconSelector height={16} />}
                    />
                    <DateTimePicker
                      value={endDate}
                      onChange={setEndDate}
                      size="sm"
                      miw={175}
                      clearable
                      placeholder="End"
                      timePickerProps={{
                        withDropdown: true,
                        popoverProps: { withinPortal: false },
                        format: "12h",
                      }}
                      leftSection={<CalendarMonthIcon />}
                      rightSection={endDate ? null : <IconSelector height={16} />}
                    />
                  </Group>
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
                <Title
                  order={4}
                  lineClamp={1}
                  miw={175}
                  c="elv-gray.9"
                  fs={record.expired ? "italic" : ""}
                >
                  <Group wrap="nowrap" gap={4}>
                    {
                      (record.issueTime && record.expireTime) ?
                        (
                          <>
                            {
                              `${new Date(record.issueTime).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                              })} - ${new Date(record.expireTime).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                              })}`
                            }
                            {
                              record.expired ? <Text c="elv-red.4">expired</Text> : ""
                            }
                          </>
                        ) : "--"
                    }
                  </Group>
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

export default SavedLinks;
