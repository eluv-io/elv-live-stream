import {observer} from "mobx-react-lite";
import {
  ActionIcon,
  Box,
  Button,
  Grid,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {useClipboard} from "@mantine/hooks";
import {IconSelector} from "@tabler/icons-react";
import {dataStore} from "@/stores/index.js";
import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {DatePickerInput} from "@mantine/dates";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {useForm} from "@mantine/form";
import {notifications} from "@mantine/notifications";
import {CalendarMonthIcon, LinkIcon, TrashIcon} from "@/assets/icons/index.js";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {DataTable} from "mantine-datatable";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {CheckExpiration} from "@/utils/helpers.js";

const SrtGenerate = observer(({objectId, originUrl}) => {
  const form = useForm(({
    mode: "uncontrolled",
    initialValues: {
      region: "",
      label: "",
      useSecure: true,
      dates: [null, null] // controlled
    }
  }));

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
          records={[form]}
          withColumnBorders
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

const QuickLinks = observer(({links, setModalData}) => {
  const clipboard = useClipboard();
  return (
    <Box className={styles.tableWrapper} mb={29}>
      <DataTable
        classNames={{header: styles.tableHeader}}
        records={links}
        columns={[
          {
            accessor: "label",
            title: "Label",
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
  );
});

const TransportStreamPanel = observer(({url}) => {
  const params = useParams();

  const initModalData = {
    show: false,
    url: "",
    regionLabel: "",
    regionValue: "",
    label: ""
  };

  const [loading, setLoading] = useState(false);
  const [srtUrl, setSrtUrl] = useState(null);
  const [copyMpegTs, setCopyMpegTs] = useState(false);
  const [modalData, setModalData] = useState(initModalData);

  useEffect(() => {
    const LoadSrtPlayoutUrl = async() => {
      const srtUrlString = await dataStore.SrtPlayoutUrl({
        objectId: params.id,
        originUrl: url
      });

      setSrtUrl(srtUrlString);
    };

    const LoadConfigData = async() => {
      let {
        copyMpegTs: copyMpegTsMeta
      } = await dataStore.LoadRecordingConfigData({objectId: params.id});
      await dataStore.LoadSrtPlayoutUrls();

      setCopyMpegTs(copyMpegTsMeta);
    };

    const LoadData = async() => {
      try {
        setLoading(true);
        await LoadSrtPlayoutUrl();
        await LoadConfigData();
      } finally {
        setLoading(false);
      }
    };

    if(params.id) {
      LoadData();
    }
  }, [params.id]);

  const srtUrls = (dataStore.srtUrlsByStream?.[params.id]?.srt_urls || [])
    .map(item => {
      const regionLabel = FABRIC_NODE_REGIONS.find(data => data.value === item.region)?.label || "";

      const token = item.url?.match(/aessjc[a-zA-Z0-9]+/);
      const decoded = token ? dataStore.client.utils.DecodeSignedToken(token[0]) : {};

      return ({
        value: item.url,
        label: decoded?.payload?.ctx?.usr?.label || item.label || "",
        region: regionLabel,
        regionValue: item.region,
        issueTime: decoded?.payload?.iat,
        expireTime: decoded?.payload?.exp,
        expired: CheckExpiration(decoded?.payload?.exp)
      });
    });

  if(loading) { return <Loader />; }

  return (
    <Box maw="80%" mb={24}>
      <DisabledTooltipWrapper
        disabled={!copyMpegTs}
        tooltipLabel="Transport Stream Source recording is not enabled"
      >
        <SectionTitle mb={8}>Quick Links</SectionTitle>
        <QuickLinks
          links={
            [{label: "Anonymous Access", value: srtUrl}, ...srtUrls]
          }
          setModalData={setModalData}
        />

        <SectionTitle mb={8}>Generate New SRT URL</SectionTitle>
        <SrtGenerate
          originUrl={url}
          objectId={params.id}
        />
      </DisabledTooltipWrapper>
      <ConfirmModal
        show={modalData.show}
        confirmText="Delete"
        CloseCallback={() => setModalData(prevState => ({...prevState, show: false}))}
        ConfirmCallback={() => dataStore.DeleteSrtUrl({
          objectId: params.id,
          region: modalData.regionValue
        })}
        title="Delete SRT Link"
        customMessage={
          <Stack>
            <Text>Are you sure you want to delete the link?</Text>
            <Grid>
              <Grid.Col span={3}>
                <Text>Label:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text truncate="end">{ modalData.label || "" }</Text>
              </Grid.Col>

              <Grid.Col span={3}>
                <Text>Region:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text>{ modalData.regionLabel || "" }</Text>
              </Grid.Col>

              <Grid.Col span={3}>
                <Text>Stream URL:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text style={{wordBreak: "break-all"}}>{ modalData.url || "" }</Text>
              </Grid.Col>
            </Grid>
          </Stack>
        }
      />
    </Box>
  );
});

export default TransportStreamPanel;
