import {useRef, useState} from "react";
import {useParams} from "react-router-dom";
import path from "path";
import {observer} from "mobx-react-lite";
import {Box, Checkbox, FileButton, Flex, Group, Loader, Text, Textarea} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {DateTimePicker} from "@mantine/dates";
import {DEFAULT_WATERMARK_FORENSIC, DEFAULT_WATERMARK_TEXT, DVR_DURATION_OPTIONS, STATUS_MAP} from "@/utils/constants";
import {dataStore, editStore, streamStore} from "@/stores";
import {ENCRYPTION_OPTIONS} from "@/utils/constants";
import {Select} from "@/components/Inputs.jsx";
import classes from "@/pages/stream-details/playout/PlayoutPanel.module.css";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";


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
  const [dvrMaxDuration, setDvrMaxDuration] = useState(currentDvrMaxDuration !== undefined ? currentDvrMaxDuration : 0);

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
        title: `${title || params.id} updated`,
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
    <Box w="700px">
      <div className="form__section-header">Playout</div>
      <DisabledTooltipWrapper
        tooltipLabel="Playout Ladder configuration is disabled when the stream is running"
        disabled={[STATUS_MAP.RUNNING].includes(status)}
      >
        <Box mb={24}>
          <Select
            label="Playout Ladder"
            formName="playoutLadder"
            options={ladderProfilesData}
            defaultOption={{
              value: "",
              label: "Select Ladder Profile"
            }}
            style={{width: "100%"}}
            helperText={ladderProfilesData.length > 0 ? null : "No profiles are configured. Create a profile in Settings."}
            value={playoutProfile}
            onChange={(event) => setPlayoutProfile(event.target.value)}
          />
        </Box>
      </DisabledTooltipWrapper>
      <DisabledTooltipWrapper
        tooltipLabel="DRM configuration is disabled when the stream is active"
        disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED].includes(status)}
      >
        <Box mb={24}>
          <Select
            label="DRM"
            formName="playbackEncryption"
            options={ENCRYPTION_OPTIONS}
            style={{width: "100%"}}
            defaultOption={{
              value: "",
              label: "Select DRM"
            }}
            value={drm}
            onChange={(event) => setDrm(event.target.value)}
            tooltip={
              ENCRYPTION_OPTIONS.map(({label, title, value}) =>
                <Flex
                  key={`encryption-value-${value}`}
                  gap="1rem"
                  lh={1.25}
                  pb={5}
                  maw={500}
                >
                  <Flex flex="0 0 25%">{ label }:</Flex>
                  <Text fz="sm">{ title }</Text>
                </Flex>
              )
            }
          />
        </Box>
      </DisabledTooltipWrapper>

      <DisabledTooltipWrapper tooltipLabel="DVR configuration is disabled while the stream is running" disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}>
        <div className="form__section-header">DVR</div>

        <Box mb={24}>
          <Checkbox
              label="Enable DVR"
              checked={dvrEnabled}
              description="Users can seek back in the live stream."
              onChange={(event) => setDvrEnabled(event.target.checked)}
            />
        </Box>
        {
          dvrEnabled &&
          <>
            <Box mb={24}>
              <DateTimePicker
                label="Start Time"
                placeholder="Pick date and time"
                description="Users can only seek back to this point in time. Useful for event streams. If not set, users can seek to the beginning of the stream."
                value={dvrStartTime}
                onChange={setDvrStartTime}
                disabled={!dvrEnabled}
                valueFormat={"MM/DD/YYYY, HH:mm:ss A"}
                minDate={new Date()}
                w="100%"
                size="md"
                classNames={{
                  label: classes.datePickerLabel,
                  description: classes.datePickerDescription,
                  input: classes.datePickerInput,
                  placeholder: classes.datePickerPlaceholder
              }}
                clearable
                withSeconds
              />
            </Box>
            <Box mb={24}>
              <Select
                label="Max Duration"
                labelDescription="Users are only able to seek back this many minutes. Useful for 24/7 streams and long events."
                formName="maxDuration"
                options={DVR_DURATION_OPTIONS}
                style={{width: "100%"}}
                defaultOption={{
                  value: "",
                  label: "Select Max Duration"
                }}
                value={dvrMaxDuration}
                onChange={(event) => setDvrMaxDuration(event.target.value)}
                disabled={!dvrEnabled}
              />
            </Box>
          </>
        }
      </DisabledTooltipWrapper>


      <Box mb="24px">
        <Group mb={16}>
          <div className="form__section-header">Visible Watermark</div>
        </Group>

        <Box mb={24}>
          <Select
            label="Watermark Type"
            formName="watermarkType"
            options={[
              {label: "None", value: ""},
              {label: "Image", value: "IMAGE"},
              {label: "Text", value: "TEXT"},
              {label: "Forensic", value: "FORENSIC"}
            ]}
            value={watermarkType}
            onChange={(event) => {
              const {value} = event.target;
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
            style={{width: "100%"}}
          />
        </Box>
        {
          ["FORENSIC", "TEXT"].includes(watermarkType) &&
          <Textarea
            mb={16}
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
            >
              {(props) => (
                <button type="button" className="button__secondary" {...props}>Upload image</button>
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
      <button
        type="button"
        disabled={applyingChanges}
        className="button__primary"
        onClick={HandleSubmit}
      >
        {applyingChanges ? <Loader type="dots" size="xs" style={{margin: "0 auto"}} /> : "Apply"}
      </button>
    </Box>
  );
});

export default PlayoutPanel;
