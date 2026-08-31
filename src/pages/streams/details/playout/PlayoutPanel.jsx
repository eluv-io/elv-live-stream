import {useEffect, useRef, useState} from "react";
import {useParams} from "react-router-dom";
import {observer} from "mobx-react-lite";
import {useForm} from "@mantine/form";
import {
  Box,
  Checkbox,
  Divider, Loader,
  MultiSelect,
  Select,
  SimpleGrid,
  Textarea,
} from "@mantine/core";
import {DateTimePicker} from "@mantine/dates";
import {
  DEFAULT_WATERMARK_FORENSIC,
  DEFAULT_WATERMARK_IMAGE,
  DEFAULT_WATERMARK_TEXT,
  DVR_DURATION_OPTIONS,
  PLAYOUT_FORMAT_OPTIONS,
  STATUS_MAP
} from "@/utils/constants.ts";
import {streamEditStore, streamStore, streamSaveStore} from "@/stores/index.ts";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCalendarEvent, IconSelector} from "@tabler/icons-react";

const PlayoutPanel = observer(({
  status,
  slug,
  active,
  checkVersion
}) => {
  const [loading, setLoading] = useState(false);
  const params = useParams();
  const loadedRef = useRef(null);

  const currentDrm = streamStore.streams?.[slug].drm;
  const simpleWatermark = streamStore.streams?.[slug].simpleWatermark;
  const imageWatermark = streamStore.streams?.[slug].imageWatermark;
  const forensicWatermark = streamStore.streams?.[slug].forensicWatermark;

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      drm: [],
      formWatermarks: {},
      watermarkType: "",
      dvrEnabled: false,
      dvrStartTime: null,
      dvrMaxDuration: ""
    },
    onValuesChange: () => streamSaveStore.SetDirty({id: "playout", isDirty: form.isDirty()})
  });

  const {formWatermarks, watermarkType, dvrEnabled} = form.getValues();

  const LoadConfigData = async () => {
    try {
      setLoading(true);

      let {
        drm: drmMeta,
        dvrEnabled: dvrEnabledMeta,
        dvrMaxDuration: dvrMaxDurationMeta,
        dvrStartTime: dvrStartTimeMeta,
        forensicWatermark: forensicWatermarkMeta,
        imageWatermark: imageWatermarkMeta,
        simpleWatermark: simpleWatermarkMeta,
        watermarkType: watermarkTypeMeta
      } = await streamStore.LoadPlayoutConfigData({objectId: params.id, slug});

      const values = {
        drm: drmMeta ?? [],
        dvrEnabled: dvrEnabledMeta ?? false,
        dvrMaxDuration: dvrMaxDurationMeta !== undefined ? dvrMaxDurationMeta : "0",
        dvrStartTime: dvrStartTimeMeta,
        watermarkType: watermarkTypeMeta,
        formWatermarks: {}
      };

      if(forensicWatermarkMeta || imageWatermarkMeta || simpleWatermarkMeta) {
        values.formWatermarks = {
          image: imageWatermarkMeta ? JSON.stringify(imageWatermarkMeta, null, 2) : undefined,
          forensic: forensicWatermarkMeta ? JSON.stringify(forensicWatermarkMeta, null, 2) : undefined,
          text: simpleWatermarkMeta ? JSON.stringify(simpleWatermarkMeta, null, 2) : undefined,
        };
      }

      // resetDirty before setValues - see comment in GeneralPanel.jsx's
      // equivalent load effect for why the order matters here.
      form.resetDirty(values);
      form.setValues(values);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Defer until this tab is first shown - every detail panel is mounted at
    // once (keepMountedMode="display-none"), so an unconditional load fires
    // all panels' fetches on page open.
    const loadKey = `${params.id}:${checkVersion}`;
    if(params.id && active && loadedRef.current !== loadKey) {
      loadedRef.current = loadKey;
      LoadConfigData();
    }
  }, [params.id, active, checkVersion]);

  const Save = async () => {
    const objectId = params.id;
    const values = form.getValues();

    await streamEditStore.UpdatePlayoutConfig({
      objectId,
      slug,
      status,
      watermarkParams: {
        watermarkType: values.watermarkType,
        textWatermark: values.watermarkType ? values.formWatermarks.text : null,
        imageWatermark: values.watermarkType ? values.formWatermarks.image : null,
        forensicWatermark: values.watermarkType ? values.formWatermarks.forensic : null,
        existingTextWatermark: simpleWatermark,
        existingImageWatermark: imageWatermark,
        existingForensicWatermark: forensicWatermark
      },
      drmParams: {
        existingPlayoutFormats: currentDrm,
        playoutFormats: values.drm
      },
      configMetaParams: {
        dvrEnabled: values.dvrEnabled,
        dvrMaxDuration: values.dvrMaxDuration,
        dvrStartTime: values.dvrStartTime,
        skipDvrSection: ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)
      }
    });

    form.resetDirty(values);
  };

  const SaveRef = useRef();
  SaveRef.current = Save;

  useEffect(() => {
    streamSaveStore.Register({
      id: "playout",
      Save: () => SaveRef.current(),
      Discard: () => form.reset()
    });

    return () => streamSaveStore.Unregister("playout");
  }, []);

  if(loading) { return <Loader />; }

  return (
    <Box maw="80%">
      <SectionTitle mb={12}>Playout</SectionTitle>
      <SimpleGrid cols={1} spacing={150} mb={29}>
        <DisabledTooltipWrapper
          tooltipLabel="DRM configuration is disabled when the stream is active"
          disabled={status !== STATUS_MAP.INACTIVE}
        >
          <MultiSelect
            label="Playback Formats"
            description="Select a playback encryption option. Enable Clear or Digital Rights Management (DRM) copy protection during playback."
            data={PLAYOUT_FORMAT_OPTIONS}
            placeholder="Select DRM"
            key={form.key("drm")}
            {...form.getInputProps("drm")}
          />
        </DisabledTooltipWrapper>
      </SimpleGrid>

      <Divider mb={29} />

      <DisabledTooltipWrapper tooltipLabel="DVR configuration is disabled while the stream is running" disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}>
        <SectionTitle mb={12}>DVR</SectionTitle>

        <Checkbox
          label="Enable DVR"
          description="Users can seek back in the live stream."
          key={form.key("dvrEnabled")}
          {...form.getInputProps("dvrEnabled", {type: "checkbox"})}
          mb={12}
        />
        {
          dvrEnabled &&
          <>
            <SimpleGrid cols={2} spacing={150}>
              <DateTimePicker
                label="Start Time"
                placeholder="Pick Date and Time"
                description="Users can only seek back to this point in time. Useful for event streams. If not set, users can seek to the beginning of the stream."
                key={form.key("dvrStartTime")}
                {...form.getInputProps("dvrStartTime")}
                disabled={!dvrEnabled}
                valueFormat={"MM/DD/YYYY, HH:mm:ss"}
                minDate={new Date()}
                w="100%"
                size="sm"
                timePickerProps={{
                  withDropdown: true,
                  popoverProps: {withinPortal: false},
                  format: "24h",
                }}
                leftSection={<IconCalendarEvent />}
                rightSection={form.getValues().dvrStartTime ? null : <IconSelector height={16}/>}
                clearable
              />
              <Select
                label="Max Duration"
                description="Users are only able to seek back this many minutes. Useful for 24/7 streams and long events."
                data={DVR_DURATION_OPTIONS}
                placeholder="Select Max Duration"
                key={form.key("dvrMaxDuration")}
                {...form.getInputProps("dvrMaxDuration")}
                disabled={!dvrEnabled}
              />
            </SimpleGrid>
          </>
        }
      </DisabledTooltipWrapper>

      <Divider mb={29} mt={29} />

      <Box mb={25}>
        <DisabledTooltipWrapper tooltipLabel="Watermark configuration is disabled when the stream is not initialized" disabled={[STATUS_MAP.UNINITIALIZED].includes(status)}>
          <SectionTitle mb={12}>Visible Watermark</SectionTitle>

          <SimpleGrid cols={2} spacing={150}>
            <Select
              label="Watermark Type"
              data={[
                {label: "None", value: ""},
                {label: "Image", value: "IMAGE"},
                {label: "Text", value: "TEXT"},
                {label: "Forensic", value: "FORENSIC", disabled: status === STATUS_MAP.UNINITIALIZED}
              ]}
              value={watermarkType}
              onChange={(value) => {
                form.setFieldValue("watermarkType", value);

                const watermarkDefault = (
                  value === "TEXT"
                    ? DEFAULT_WATERMARK_TEXT
                    : value === "FORENSIC"
                    ? DEFAULT_WATERMARK_FORENSIC
                    : DEFAULT_WATERMARK_IMAGE
                );

                const keyMap = {
                  "TEXT": "text",
                  "IMAGE": "image",
                  "FORENSIC": "forensic"
                };

                if(value) {
                  form.setFieldValue("formWatermarks", {
                    [keyMap[value]]: JSON.stringify(watermarkDefault, null, 2)
                  });
                }
              }}
              allowDeselect={false}
            />
          </SimpleGrid>
          {
            !!watermarkType &&
            <Textarea
              mb={16}
              mt={12}
              value={
                watermarkType === "TEXT" ? formWatermarks.text : watermarkType === "FORENSIC" ? formWatermarks.forensic : watermarkType === "IMAGE" ? formWatermarks.image : ""
              }
              size="md"
              rows={10}
              onChange={(event) => {
                const value = {
                  ...formWatermarks
                };

                if(watermarkType === "TEXT") {
                  value["text"] = event.target.value;
                } else if(watermarkType === "FORENSIC") {
                  value["forensic"] = event.target.value;
                } else if(watermarkType === "IMAGE") {
                  value["image"] = event.target.value;
                }

                form.setFieldValue("formWatermarks", value);
              }}
            />
          }
        </DisabledTooltipWrapper>
      </Box>
    </Box>
  );
});

export default PlayoutPanel;
