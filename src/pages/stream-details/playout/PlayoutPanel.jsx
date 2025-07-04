import {useRef, useState} from "react";
import {useParams} from "react-router-dom";
import path from "path";
import {observer} from "mobx-react-lite";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FileButton,
  Flex,
  Group,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  Tooltip
} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {DateTimePicker} from "@mantine/dates";
import {DEFAULT_WATERMARK_FORENSIC, DEFAULT_WATERMARK_TEXT, DVR_DURATION_OPTIONS, STATUS_MAP} from "@/utils/constants";
import {dataStore, editStore, streamStore} from "@/stores";
import {ENCRYPTION_OPTIONS} from "@/utils/constants";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import {CalendarMonthIcon, CircleInfoIcon} from "@/assets/icons/index.js";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconSelector} from "@tabler/icons-react";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const PlayoutPanel = observer(({
  status,
  slug,
  currentDrm,
  simpleWatermark,
  imageWatermark,
  forensicWatermark,
  currentWatermarkType,
  title,
  currentDvrEnabled,
  currentDvrMaxDuration,
  currentDvrStartTime,
  currentPlayoutProfile
}) => {
  const [drm, setDrm] = useState(currentDrm);
  const [playoutProfile, setPlayoutProfile] = useState(currentPlayoutProfile || "");
  const [formWatermarks, setFormWatermarks] = useState(
    {
      image: imageWatermark ? imageWatermark : undefined,
      text: simpleWatermark ? JSON.stringify(simpleWatermark, null, 2) : undefined,
      forensic: forensicWatermark ? JSON.stringify(forensicWatermark, null, 2) : undefined
    }
  );
  const [watermarkType, setWatermarkType] = useState(currentWatermarkType || "");
  const [dvrEnabled, setDvrEnabled] = useState(currentDvrEnabled || false);
  const [dvrStartTime, setDvrStartTime] = useState(currentDvrStartTime !== undefined ? new Date(currentDvrStartTime) : null);
  const [dvrMaxDuration, setDvrMaxDuration] = useState(currentDvrMaxDuration !== undefined ? currentDvrMaxDuration : "0");

  const [applyingChanges, setApplyingChanges] = useState(false);
  const resetRef = useRef(null);
  const params = useParams();

  const defaultOption = dataStore.ladderProfiles?.default ?
    {
      label: dataStore.ladderProfiles.default.name,
      value: dataStore.ladderProfiles.default.name
    } : {};
  const ladderProfilesData = dataStore.ladderProfiles ?
    [
      defaultOption,
      ...dataStore.ladderProfiles.custom.map(item => ({label: item.name, value: item.name}))
    ] : [];

  const HandleSubmit = async () => {
    const objectId = params.id;

    try {
      setApplyingChanges(true);
      await streamStore.WatermarkConfiguration({
        textWatermark: watermarkType ? formWatermarks.text : null,
        imageWatermark: watermarkType ? formWatermarks.image : null,
        forensicWatermark: watermarkType ? formWatermarks.forensic : null,
        existingTextWatermark: simpleWatermark,
        existingImageWatermark: imageWatermark,
        existingForensicWatermark: forensicWatermark,
        watermarkType,
        objectId,
        slug,
        status
      });

      await streamStore.DrmConfiguration({
        objectId,
        slug,
        existingDrmType: currentDrm,
        drmType: drm
      });

      await editStore.UpdateConfigMetadata({
        objectId,
        slug,
        dvrEnabled,
        dvrMaxDuration,
        dvrStartTime,
        playoutProfile,
        skipDvrSection: ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)
      });

      await streamStore.UpdateLadderSpecs({
        objectId,
        slug,
        profile: playoutProfile
      });

      notifications.show({
        title: <NotificationMessage>Updated {title || params.id}</NotificationMessage>,
        message: "Settings have been applied successfully"
      });
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to apply settings"
      });

      // eslint-disable-next-line no-console
      console.error("Unable to apply settings", error);
    } finally {
      setApplyingChanges(false);
    }
  };

  return (
    <Box maw="80%">
      <SectionTitle mb={12}>Playout</SectionTitle>
      <SimpleGrid cols={2} spacing={150} mb={29}>
        <DisabledTooltipWrapper
          tooltipLabel="Playout Ladder configuration is disabled when the stream is running"
          disabled={[STATUS_MAP.RUNNING].includes(status)}
        >
          <Select
            label="Playout Ladder"
            name="playoutLadder"
            data={ladderProfilesData}
            placeholder="Select Ladder Profile"
            description={ladderProfilesData.length > 0 ? null : "No profiles are configured. Create a profile in Settings."}
            value={playoutProfile}
            onChange={(value) => setPlayoutProfile(value)}
          />
        </DisabledTooltipWrapper>
        <DisabledTooltipWrapper
          tooltipLabel="DRM configuration is disabled when the stream is active"
          disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED].includes(status)}
        >
          <Select
            label={
            <Flex align="center" gap={6}>
              DRM
              <Tooltip
                multiline
                w={460}
                label={
                  ENCRYPTION_OPTIONS.map(({label, title, id}) =>
                    <Flex
                      key={`encryption-info-${id}`}
                      gap="1rem"
                      lh={1.25}
                      pb={5}
                    >
                      <Flex flex="0 0 35%">{ label }:</Flex>
                      <Text fz="sm">{ title }</Text>
                    </Flex>
                  )
                }
              >
                <Flex w={16}>
                  <CircleInfoIcon color="var(--mantine-color-elv-gray-8)" />
                </Flex>
              </Tooltip>
            </Flex>
          }
            name="playbackEncryption"
            data={ENCRYPTION_OPTIONS}
            placeholder="Select DRM"
            value={drm}
            onChange={(value) => setDrm(value)}
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
                leftSection={<CalendarMonthIcon/>}
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

              if(value === "TEXT") {
                setFormWatermarks({
                  text: JSON.stringify(DEFAULT_WATERMARK_TEXT, null, 2)
                });
              } else if(value === "FORENSIC") {
                setFormWatermarks({
                  forensic: JSON.stringify(DEFAULT_WATERMARK_FORENSIC, null, 2)
                });
              }
            }}
          />
        </SimpleGrid>
        {
          ["FORENSIC", "TEXT"].includes(watermarkType) &&
          <Textarea
            mb={16}
            mt={12}
            value={watermarkType === "TEXT" ? formWatermarks.text : watermarkType === "FORENSIC" ? formWatermarks.forensic : ""}
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
              }

              setFormWatermarks(value);
            }}
          />
        }
        {
          watermarkType === "IMAGE" &&
          <>
            <FileButton
              onChange={(file) => {
                if(!file) { return; }
                const value = {
                  ...formWatermarks,
                  image: file
                };

                setFormWatermarks(value);
              }}
              accept="image/*"
              resetRef={resetRef}
              mt={12}
            >
              {(props) => (
                <Button variant="outline" {...props}>Upload image</Button>
              )}
            </FileButton>
            {
              formWatermarks?.image ?
                (
                  <Group mb={16} mt={16}>
                    Selected File:
                    <Text>
                      { path.basename(formWatermarks?.image?.name || formWatermarks?.image?.image?.["/"]) }
                    </Text>
                  </Group>
                )
                : null
            }
          </>
        }
      </Box>
      <Button
        disabled={applyingChanges}
        variant="filled"
        onClick={HandleSubmit}
        loading={applyingChanges}
      >
        Apply
      </Button>
    </Box>
  );
});

export default PlayoutPanel;
