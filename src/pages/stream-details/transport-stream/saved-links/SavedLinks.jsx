import {observer} from "mobx-react-lite";
import {useForm} from "@mantine/form";
import {dataStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import {Box, Button, Select, TextInput} from "@mantine/core";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {DatePickerInput} from "@mantine/dates";
import {CalendarMonthIcon} from "@/assets/icons/index.js";
import {IconSelector} from "@tabler/icons-react";
import {useState} from "react";

const SavedLinks = observer(({objectId, originUrl}) => {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      region: "",
      label: "",
      useSecure: true,
      dates: [null, null] // controlled
    }
  });

  const [dates, setDates] = useState([null, null]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          expirationTime: dates[1] ? dates[1].getTime() : (futureDate.getTime()),
          issueTime: dates[0] ? dates[0].getTime() : currentDate.getTime(),
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

  return (
    <form onSubmit={form.onSubmit(HandleSubmit)}>
      <Box className={styles.tableWrapper} mb={29}>
        <DataTable
          classNames={{header: styles.tableHeader}}
          records={[form.values]}
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
                <DatePickerInput
                  key={form.values.dates?.map((d) => d?.toISOString()).join("-")}
                  type="range"
                  placeholder="Select Issue and Expiration Dates"
                  value={dates}
                  onChange={(value) => setDates(value)}
                  size="sm"
                  minDate={new Date()}
                  miw={275}
                  clearable
                  leftSection={<CalendarMonthIcon />}
                  rightSection={<IconSelector height={16} />}
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
    </form>
  );
});

export default SavedLinks;
