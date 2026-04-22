import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {observer} from "mobx-react-lite";
import {
  Box,
  Button,
  Checkbox,
  Divider, Loader,
  MultiSelect,
  Select,
  SimpleGrid,
  Textarea,
} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {DateTimePicker} from "@mantine/dates";
import {
  DEFAULT_WATERMARK_FORENSIC,
  DEFAULT_WATERMARK_IMAGE,
  DEFAULT_WATERMARK_TEXT,
  DVR_DURATION_OPTIONS,
  PLAYOUT_FORMAT_OPTIONS,
  STATUS_MAP
} from "@/utils/constants.js";
import {dataStore, streamEditStore} from "@/stores/index.js";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCalendarEvent, IconSelector} from "@tabler/icons-react";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const PlayoutPanel = observer(({
  status,
  slug,
  currentDrm,
  simpleWatermark,
  imageWatermark,
  forensicWatermark,
  title,
  checkVersion
}) => {
  const [drm, setDrm] = useState([]);
  const [formWatermarks, setFormWatermarks] = useState({});
  const [watermarkType, setWatermarkType] = useState("");
  const [dvrEnabled, setDvrEnabled] = useState(false);
  const [dvrStartTime, setDvrStartTime] = useState(null);
  const [dvrMaxDuration, setDvrMaxDuration] = useState("");

  const [loading, setLoading] = useState(false);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const params = useParams();

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
      } = await dataStore.LoadPlayoutConfigData({objectId: params.id});

      setDrm(drmMeta ?? []);
      setDvrEnabled(dvrEnabledMeta);
      setDvrMaxDuration(dvrMaxDurationMeta !== undefined ? dvrMaxDurationMeta : "0");
      setDvrStartTime(dvrStartTimeMeta);
      setWatermarkType(watermarkTypeMeta);
      if(forensicWatermarkMeta || imageWatermarkMeta || simpleWatermarkMeta) {
        setFormWatermarks({
          image: imageWatermarkMeta ? JSON.stringify(imageWatermarkMeta, null, 2) : undefined,
          forensic: forensicWatermarkMeta ? JSON.stringify(forensicWatermarkMeta, null, 2) : undefined,
          simple: simpleWatermarkMeta ? JSON.stringify(simpleWatermarkMeta, null, 2) : undefined,
        });
      }

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(params.id) {
      LoadConfigData();
    }
  }, [params.id, checkVersion]);

  const HandleSubmit = async () => {
    const objectId = params.id;

    try {
      setApplyingChanges(true);

      await streamEditStore.UpdatePlayoutConfig({
        objectId,
        slug,
        status,
        watermarkParams: {
          watermarkType,
          textWatermark: watermarkType ? formWatermarks.text : null,
          imageWatermark: watermarkType ? formWatermarks.image : null,
          forensicWatermark: watermarkType ? formWatermarks.forensic : null,
          existingTextWatermark: simpleWatermark,
          existingImageWatermark: imageWatermark,
          existingForensicWatermark: forensicWatermark
        },
        drmParams: {
          existingPlayoutFormats: currentDrm,
          playoutFormats: drm
        },
        configMetaParams: {
          dvrEnabled,
          dvrMaxDuration,
          dvrStartTime,
          skipDvrSection: ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)
        }
      });

      notifications.show({
        title: <NotificationMessage>Updated {title || params.id}</NotificationMessage>,
        message: "Settings have been saved successfully"
      });
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to save settings"
      });

      // eslint-disable-next-line no-console
      console.error("Unable to save settings", error);
    } finally {
      setApplyingChanges(false);
    }
  };

  if(loading) { return <Loader />; }

  return (
    <Box maw="80%">
      <SectionTitle mb={12}>Playout</SectionTitle>
      <SimpleGrid cols={1} spacing={150} mb={29}>
        <DisabledTooltipWrapper
          tooltipLabel="DRM configuration is disabled when the stream is active"
          disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED].includes(status)}
        >
          <MultiSelect
            label="Playback Formats"
            name="playbackEncryption"
            description="Select a playback encryption option. Enable Clear or Digital Rights Management (DRM) copy protection during playback."
            data={PLAYOUT_FORMAT_OPTIONS}
            placeholder="Select DRM"
            value={drm}
            onChange={(value) => setDrm(value)}
            allowDeselect={false}
          />
        </DisabledTooltipWrapper>
      </SimpleGrid>

      <Divider mb={29} />

      <DisabledTooltipWrapper tooltipLabel="DVR configuration is disabled while the stream is running" disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}>
        <SectionTitle mb={12}>DVR</SectionTitle>

        <Checkbox
          label="Enable DVR"
          checked={dvrEnabled}
          description="Users can seek back in the live stream."
          onChange={(event) => setDvrEnabled(event.target.checked)}
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
                value={dvrStartTime}
                onChange={setDvrStartTime}
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
                rightSection={dvrStartTime ? null : <IconSelector height={16}/>}
                clearable
              />
              <Select
                label="Max Duration"
                description="Users are only able to seek back this many minutes. Useful for 24/7 streams and long events."
                name="maxDuration"
                data={DVR_DURATION_OPTIONS}
                placeholder="Select Max Duration"
                value={dvrMaxDuration}
                onChange={(value) => setDvrMaxDuration(value)}
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
              name="watermarkType"
              data={[
                {label: "None", value: ""},
                {label: "Image", value: "IMAGE"},
                {label: "Text", value: "TEXT"},
                {label: "Forensic", value: "FORENSIC", disabled: status === STATUS_MAP.UNINITIALIZED}
              ]}
              value={watermarkType}
              onChange={(value) => {
                setWatermarkType(value);

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
                  setFormWatermarks({
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

                setFormWatermarks(value);
              }}
            />
          }
        </DisabledTooltipWrapper>
      </Box>
      <Button
        disabled={applyingChanges}
        variant="filled"
        onClick={HandleSubmit}
        loading={applyingChanges}
      >
        Save
      </Button>
    </Box>
  );
});

export default PlayoutPanel;
