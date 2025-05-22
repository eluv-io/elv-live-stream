import {Box, Button, Group, Select, Text, TextInput} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {dataStore} from "@/stores/index.js";
import {DateTimePicker} from "@mantine/dates";
import {CalendarMonthIcon} from "@/assets/icons/index.js";
import {IconSelector} from "@tabler/icons-react";
import {useState} from "react";
import {notifications} from "@mantine/notifications";

const SrtLinkForm = ({
  objectId,
  originUrl,
  showGenerateButton=true,
  hideActiveRegions=true,
  showNodeConfig=false,
  showLinkConfig=true,
  nodeData=[],
  formData={},
  HandleFormChange,
  HandleGenerateLink
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const HandleSubmit = async() => {
    try {
      setIsSubmitting(true);
      await HandleGenerateLink();

      notifications.show({
        title: "New link created",
        message: `Link for ${formData.region} successfully created`
      });
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
          placeholder="Enter a Label"
          value={formData.label}
          onChange={(event) => HandleFormChange({key: "label", value: event.target.value})}
        />
      )
    },
    {
      accessor: "region",
      title: "Region",
      titleClassName: "no-border-end",
      render: () => (
        <Select
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
          value={formData.region}
          onChange={(value) => HandleFormChange({key: "region", value})}
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
            value={formData.startDate}
            onChange={(value) => HandleFormChange({key: "startDate", value})}
            name="startDate"
            valueFormat="MMM DD, YYYY HH:mm"
            size="sm"
            minDate={new Date()}
            maxDate={formData.endDate}
            miw={220}
            clearable
            placeholder="Start"
            timePickerProps={{
              withDropdown: true,
              popoverProps: {withinPortal: false},
              format: "24h",
            }}
            leftSection={<CalendarMonthIcon/>}
            rightSection={formData.startDate ? null : <IconSelector height={16}/>}
          />
          <DateTimePicker
            value={formData.endDate}
            onChange={(value) => HandleFormChange({key: "endDate", value})}
            name="endDate"
            valueFormat="MMM DD, YYYY HH:mm"
            minDate={Math.max(new Date().getTime(), new Date(formData.startDate).getTime())}
            size="sm"
            miw={220}
            clearable
            placeholder="End"
            timePickerProps={{
              withDropdown: true,
              popoverProps: {withinPortal: false},
              format: "24h",
            }}
            leftSection={<CalendarMonthIcon/>}
            rightSection={formData.endDate ? null : <IconSelector height={16}/>}
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
      render: () => <Button type="button" loading={isSubmitting} onClick={HandleSubmit}>Generate</Button>
    });
  }

  return (
    <>
      {
        showLinkConfig &&
        <Box className={styles.tableWrapper} mb={29}>
          {/* Form table to generate links */}
          <DataTable
            classNames={{header: styles.tableHeader}}
            records={[
              {id: "link-form-row", ...formData}
            ]}
            minHeight={75}
            withColumnBorders
            columns={columns}
          />
        </Box>
      }

      {/* Node form */}
      {
        showNodeConfig &&
        <Box className={styles.tableWrapper} mb={29}>
          <DataTable
            classNames={{header: styles.tableHeader}}
            records={[
              {id: "node-form-row", url: originUrl, node: formData.fabricNode}
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
                    value={formData.fabricNode}
                    onChange={(value) => HandleFormChange({key: "fabricNode", value})}
                  />
                )
              }
            ]}
          />
        </Box>
      }
    </>
  );
};

export default SrtLinkForm;
