import {cloneElement, useRef, useState} from "react";
import {useParams} from "react-router-dom";
import path from "path";
import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Checkbox, FileButton, Flex, Group, Menu, Paper, Text, Textarea} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {DateTimePicker} from "@mantine/dates";
import {DEFAULT_WATERMARK_TEXT, DVR_DURATION_OPTIONS, STATUS_MAP} from "@/utils/constants";
import {editStore, streamStore} from "@/stores";
import {ENCRYPTION_OPTIONS} from "@/utils/constants";
import {Select} from "@/components/Inputs.jsx";
import {Loader} from "@/components/Loader.jsx";
import classes from "@/assets/stylesheets/modules/PlayoutPanel.module.css";
import {EditIcon, TrashIcon} from "@/assets/icons";

const WatermarkBox = ({type, value, actions=[]}) => {
  if(value === undefined) { return null; }

  const placeholderText = (type === "Image" && !value) ? "No file selected" : undefined;

  return (
    <Paper shadow="none" withBorder p="10px 16px" mb={16} mt={16}>
      <Group>
        <Flex direction="column" mr={48}>
          <Text c="dimmed" size="xs">Watermark Type</Text>
          <Text lh={1.125}>{type}</Text>
        </Flex>
        <Flex direction="column" maw={300}>
          <Text c="dimmed" size="xs">Watermark Content</Text>
          <Text lh={1.125} truncate="end">
            {placeholderText || value}
          </Text>
        </Flex>
        <Group ml="auto">
          {
            actions.map(({id, Component}) => (
              cloneElement(Component, {key: id})
            ))
          }
        </Group>
      </Group>
    </Paper>
  );
};

const PlayoutPanel = observer(({
  status,
  slug,
  currentDrm,
  simpleWatermark,
  imageWatermark,
  title,
  currentDvrEnabled,
  currentDvrMaxDuration,
  currentDvrStartTime
}) => {
  const [drm, setDrm] = useState(currentDrm);
  // const [formDrm, setFormDrm] = useState(currentDrm ? currentDrm : undefined);
  const [formWatermarks, setFormWatermarks] = useState(
    {
      image: imageWatermark ? imageWatermark : undefined,
      text: simpleWatermark ? JSON.stringify(simpleWatermark, null, 2) : undefined
    }
  );
  const [showTextWatermarkInput, setShowTextWatermarkInput] = useState(false);
  const [dvrEnabled, setDvrEnabled] = useState(currentDvrEnabled || false);
  const [dvrStartTime, setDvrStartTime] = useState(currentDvrStartTime !== undefined ? new Date(currentDvrStartTime) : null);
  const [dvrMaxDuration, setDvrMaxDuration] = useState(currentDvrMaxDuration !== undefined ? currentDvrMaxDuration : 0);

  const [applyingChanges, setApplyingChanges] = useState(false);
  const resetRef = useRef(null);
  const params = useParams();

  const ClearImageWatermark = () => {
    const value = {
      text: formWatermarks.text,
      image: undefined
    };

    setFormWatermarks(value);
    resetRef.current?.();
  };

  const ClearTextWatermark = () => {
    const value = {
      text: undefined,
      image: formWatermarks.image
    };

    setFormWatermarks(value);
    setShowTextWatermarkInput(false);
  };

  const HandleSubmit = async () => {
    const objectId = params.id;

    try {
      setApplyingChanges(true);
      await streamStore.WatermarkConfiguration({
        existingTextWatermark: simpleWatermark,
        textWatermark: formWatermarks.text,
        existingImageWatermark: imageWatermark,
        imageWatermark: formWatermarks.image,
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
        dvrStartTime
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
    <>
      <Box data-disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED].includes(status)} mb="24px" maw="50%" className={classes.box}>
        <div className="form__section-header">Playout</div>
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
              <div key={`encryption-info-${value}`} className="form__tooltip-item">
                <div className="form__tooltip-item__encryption-title">{label}:</div>
                <div>{title}</div>
              </div>
            )
          }
        />
      </Box>

      <Box mb={24} maw="50%">
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
          </>
        }
      </Box>

      <Box mb="24px" maw="50%">
        <Group mb={16}>
          <div className="form__section-header">Visible Watermark</div>
        </Group>

        {/* Add WM button */}
        <Menu>
          <Menu.Target>
            <button type="button" className="button__secondary">Add Watermark</button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => {
              setFormWatermarks({
                text: formWatermarks.text,
                image: ""
              });
            }}>
              Image Watermark
            </Menu.Item>
            <Menu.Item onClick={() => {
              setFormWatermarks({
                text: JSON.stringify(DEFAULT_WATERMARK_TEXT, null, 2),
                image: formWatermarks.image
              });
            }}>
              Text Watermark
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <WatermarkBox
          value={formWatermarks.text ? formWatermarks.text : undefined}
          type="Text"
          actions={[
            {
              id: "text-edit",
              Component: (
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="gray"
                  onClick={() => setShowTextWatermarkInput(!showTextWatermarkInput)}
                >
                  <EditIcon />
                </ActionIcon>
              )
            },
            {
              id: "text-delete",
              Component: (
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="gray"
                  onClick={ClearTextWatermark}
                >
                  <TrashIcon />
                </ActionIcon>
              )
            }
          ]}
        />
        {
          showTextWatermarkInput &&
          <Textarea
            mb={16}
            value={formWatermarks.text}
            size="md"
            rows={10}
            onChange={(event) => {
              const value = {
                image: formWatermarks.image,
                text: event.target.value
              };

              setFormWatermarks(value);
            }}
          />
        }
        <WatermarkBox
          type="Image"
          value={formWatermarks.image === undefined ? undefined : (formWatermarks?.image === "" ? "" : path.basename(formWatermarks?.image?.name || formWatermarks?.image?.image?.["/"]))}
          actions={[
            {
              id: "image-edit",
              Component: (
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
                    <ActionIcon size={20} variant="transparent" color="gray" {...props}>
                      <EditIcon />
                    </ActionIcon>
                  )}
                </FileButton>
              )
            },
            {
              id: "image-delete",
              Component: (
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="gray"
                  onClick={ClearImageWatermark}
                >
                  <TrashIcon />
                </ActionIcon>
              )
            }
          ]}
        />
      </Box>
      <button
        type="button"
        disabled={applyingChanges}
        className="button__primary"
        onClick={HandleSubmit}
      >
        {applyingChanges ? <Loader loader="inline" className="modal__loader"/> : "Apply"}
      </button>
    </>
  );
});

export default PlayoutPanel;
