import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Button, Loader, Select, Stack, Table, Text, TextInput, Tooltip} from "@mantine/core";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {useClipboard} from "@mantine/hooks";
import {IconLink} from "@tabler/icons-react";
import {dataStore} from "@/stores/index.js";
import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {DatePickerInput} from "@mantine/dates";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {useForm} from "@mantine/form";
import {notifications} from "@mantine/notifications";

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
      setIsSubmitting(true);

      const {label, useSecure, region} = values;

      const url = await dataStore.SrtPlayoutUrl({
        objectId,
        originUrl,
        tokenData: {
          expirationTime: dates[1],
          issueTime: dates[0],
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
      <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Region</Table.Th>
          <Table.Th>Label</Table.Th>
          {/*<Table.Th>Secure Signature</Table.Th>*/}
          <Table.Th>Time Range</Table.Th>
          <Table.Th></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
      <Table.Tr>
        <Table.Td>
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
        </Table.Td>
        <Table.Td>
          <TextInput
            key={form.key("label")}
            {...form.getInputProps("label")}
          />
        </Table.Td>
        {/*<Table.Td>*/}
        {/*  <Checkbox*/}
        {/*    value={form.key("useSecure")}*/}
        {/*    {...form.getInputProps("useSecure", {type: "checkbox"})}*/}
        {/*  />*/}
        {/*</Table.Td>*/}
        <Table.Td>
          <DatePickerInput
            key={form.values.dates?.map((d) => d?.toISOString()).join("-")}
            type="range"
            placeholder="Select issue and expiration dates"
            value={dates}
            onChange={(value) => setDates(value)}
            size="sm"
            minDate={new Date()}
            w={275}
          />
        </Table.Td>
        <Table.Td>
          <Button type="submit" loading={isSubmitting}>Generate</Button>
        </Table.Td>
      </Table.Tr>
      </Table.Tbody>
      </Table>
    </form>
  );
});

const QuickLinks = observer(({links}) => {
  const clipboard = useClipboard();

  return (
    <Table mb={29}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Label</Table.Th>
          <Table.Th>URL</Table.Th>
          <Table.Th></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {
          links.map(({label, region, value}) => (
            <Table.Tr key={`srt-link-${value}`}>
              <Table.Td>
                <Stack gap={2}>
                  <Text fz={14} c="elv-gray.9">
                    { label || "--" }
                  </Text>
                  {
                    region &&
                    <Text fz={12} c="elv-gray.8">
                      { region }
                    </Text>
                  }
                </Stack>
              </Table.Td>
              <Table.Td>
                <Text lineClamp={1} miw={300} maw={700} fz={14} c="elv-gray.9" style={{wordBreak: "break-all"}}>
                  { value }
                </Text>
              </Table.Td>
              <Table.Td>
                <Tooltip
                  label={clipboard.copied ? "Copied" : "Copy"}
                  position="bottom"
                >
                  <ActionIcon
                    size="xs"
                    variant="transparent"
                    color="elv-gray.5"
                    onClick={() => clipboard.copy(value)}
                  >
                    <IconLink color="var(--mantine-color-elv-gray-8)" />
                  </ActionIcon>
                </Tooltip>
              </Table.Td>
            </Table.Tr>
          ))
        }
      </Table.Tbody>
    </Table>
  );
});

const TransportStreamPanel = observer(({url}) => {
  const params = useParams();

  const [loading, setLoading] = useState(false);
  const [srtUrl, setSrtUrl] = useState(null);
  const [copyMpegTs, setCopyMpegTs] = useState(false);

  useEffect(() => {
    const LoadSrtPlayoutUrl = async() => {
      const srtUrlString = await dataStore.SrtPlayoutUrl({
        objectId: params.id,
        originUrl: url
      });

      setSrtUrl(srtUrlString);
    };

    const LoadConfigData = async() => {
      try {
        setLoading(true);
        let {
          copyMpegTs: copyMpegTsMeta
        } = await dataStore.LoadRecordingConfigData({objectId: params.id});
        await dataStore.LoadSrtPlayoutUrls();

        setCopyMpegTs(copyMpegTsMeta);
      } finally {
        setLoading(false);
      }
    };


    if(params.id) {
      LoadSrtPlayoutUrl();
      LoadConfigData();
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
        region: regionLabel
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
        />

        <SectionTitle mb={8}>Generate SRT URL</SectionTitle>
        <SrtGenerate
          originUrl={url}
          objectId={params.id}
        />
      </DisabledTooltipWrapper>
    </Box>
  );
});

export default TransportStreamPanel;
