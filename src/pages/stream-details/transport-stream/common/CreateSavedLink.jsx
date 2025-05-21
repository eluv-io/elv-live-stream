import {Box, Button, Group, Loader, Select, Text, TextInput} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {dataStore} from "@/stores/index.js";
import {DateTimePicker} from "@mantine/dates";
import {CalendarMonthIcon} from "@/assets/icons/index.js";
import {IconSelector} from "@tabler/icons-react";
import {notifications} from "@mantine/notifications";
import {useState} from "react";

const NodeForm = ({
  show,
  originUrl,
  fabricNode,
  setFabricNode,
  nodeData
}) => {
  if(!show) { return null; }

  return (
    <Box className={styles.tableWrapper} mb={29}>
      {/* Form table to generate links */}
      <DataTable
        classNames={{header: styles.tableHeader}}
        records={[
          {id: "node-form-row", url: originUrl, node: fabricNode}
        ]}
        minHeight={75}
        withColumnBorders
        columns={[
          {
            accessor: "url",
            title: "URL",
            render: () => <Text truncate="end" maw={700}>{originUrl}</Text>
          },
          {
            accessor: "node",
            title: "Fabric Node",
            width: 400,
            render: () => (
              <Select
                data={nodeData}
                placeholder="Select Node"
                value={fabricNode}
                onChange={setFabricNode}
              />
            )
          }
        ]}
      />
    </Box>
  );
};

const CreateSavedLink = ({
  objectId,
  originUrl,
  showGenerateButton=true,
  hideActiveRegions=true,
  showNodeConfig=false,
  nodeData=[],
  form,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  fabricNode,
  setFabricNode
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const HandleSubmit = async(values) => {
    try {
      const issueTime = startDate ? new Date(startDate) : new Date();
      const futureDate = new Date(issueTime.getTime() + 14 * 24 * 60 * 60 * 1000); // Add 2 weeks
      setIsSubmitting(true);

      const {label, useSecure, region} = values;

      const url = await dataStore.SrtPlayoutUrl({
        objectId,
        originUrl,
        tokenData: {
          expirationTime: endDate ? new Date(endDate).getTime() : (futureDate.getTime()),
          issueTime: issueTime.getTime(),
          label,
          useSecure,
          region
        }
      });

      await dataStore.UpdateSiteObject({objectId, url, region, label});

      notifications.show({
        title: "New link created",
        message: `Link for ${region} successfully created`
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

  const columns = [
    {
      accessor: "label",
      title: "Label",
      titleClassName: "no-border-end",
      render: () => (
        <TextInput
          key={form.key("label")}
          placeholder="Enter a Label"
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
              if(!hideActiveRegions) { return item; }

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
            valueFormat="MMM DD, YYYY HH:mm A"
            size="sm"
            minDate={new Date()}
            miw={220}
            clearable
            placeholder="Start"
            timePickerProps={{
              withDropdown: true,
              popoverProps: {withinPortal: false},
              format: "12h",
            }}
            leftSection={<CalendarMonthIcon/>}
            rightSection={startDate ? null : <IconSelector height={16}/>}
          />
          <DateTimePicker
            value={endDate}
            onChange={setEndDate}
            valueFormat="MMM DD, YYYY hh:mm A"
            minDate={startDate}
            size="sm"
            miw={220}
            clearable
            placeholder="End"
            timePickerProps={{
              withDropdown: true,
              popoverProps: {withinPortal: false},
              format: "12h",
            }}
            leftSection={<CalendarMonthIcon/>}
            rightSection={endDate ? null : <IconSelector height={16}/>}
          />
        </Group>
      )
    }
  ];

  if(showGenerateButton) {
    columns.push({
      accessor: "actions",
      textAlign: "center",
      title: "",
      render: () => <Button type="submit" loading={isSubmitting}>Generate</Button>
    });
  }

  if(!form) { return <Loader />; }

  return (
    <>
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <Box className={styles.tableWrapper} mb={29}>
          {/* Form table to generate links */}
          <DataTable
            classNames={{header: styles.tableHeader}}
            records={[form]}
            minHeight={75}
            withColumnBorders
            columns={columns}
          />
        </Box>
      </form>
      <NodeForm
        show={showNodeConfig}
        originUrl={originUrl}
        nodeData={nodeData}
        fabricNode={fabricNode}
        setFabricNode={setFabricNode}
      />
    </>
  );
};

export default CreateSavedLink;
