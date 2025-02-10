import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {dataStore, editStore, streamStore, rootStore} from "@/stores";
import {useNavigate} from "react-router-dom";
import {ENCRYPTION_OPTIONS, RETENTION_OPTIONS} from "@/utils/constants";
import {
  Accordion,
  Alert,
  Box,
  Button,
  Flex,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {isNotEmpty, useForm} from "@mantine/form";
import {IconAlertCircle} from "@tabler/icons-react";

import {CircleInfoIcon} from "@/assets/icons/index.js";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import AudioTracksTable from "@/pages/create/audio-tracks-table/AudioTracksTable.jsx";
import styles from "./Create.module.css";
import {ValidateTextField} from "@/utils/validators.js";

const Permissions = observer(({form}) => {
  const permissionLevels = rootStore.client.permissionLevels;

  return (
    <Select
      label={
        <Flex align="center" gap={6}>
          Permission
          <Tooltip
            multiline
            w={460}
            label={
              Object.values(rootStore.client.permissionLevels).map(({short, description}) =>
                <Flex
                  key={`permission-info-${short}`}
                  gap="1rem"
                  lh={1.25}
                  pb={5}
                >
                  <Flex flex="0 0 25%">{ short }:</Flex>
                  <Text fz="sm">{ description }</Text>
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
      description="Set a permission level."
      name="permission"
      placeholder="Select Permission"
      data={
        Object.keys(permissionLevels || {}).map(permissionName => (
          {
            label: permissionLevels[permissionName].short,
            value: permissionName
          }
        ))
      }
      mb={16}
      {...form.getInputProps("permission")}
    />
  );
});

const AdvancedSettingsPanel = observer(({
  objectProbed=false,
  audioTracks,
  audioFormData,
  setAudioFormData,
  setShowProbeConfirmation,
  objectData,
  DisableProbeButton,
  ladderProfilesData,
  form,
  loading
}) => {
  return (
    <>
      <Select
        label="Retention"
        description="Select a retention period for how long stream parts will exist until they are removed from the fabric."
        name="retention"
        data={RETENTION_OPTIONS}
        placeholder="Select Retention"
        mb={16}
        {...form.getInputProps("retention")}
      />

      <Box mb={16}>
        <Select
          key={ladderProfilesData}
          label="Playout Ladder"
          name="playoutProfile"
          data={ladderProfilesData}
          placeholder={loading ? "Loading Options..." : "Select Ladder Profile"}
          mb={16}
          description={
          loading ? null : (!ladderProfilesData.length > 0) ? "No profiles are configured. Create a profile in Settings." : null
        }
          {...form.getInputProps("playoutProfile")}
        />
      </Box>

      <Select
        label={
          <Flex align="center" gap={6}>
            Playback Encryption
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
                    <Flex flex="0 0 35%">{label}:</Flex>
                    <Text fz="sm">{title}</Text>
                  </Flex>
                )
              }
            >
              <Flex w={16}>
                <CircleInfoIcon color="var(--mantine-color-elv-gray-8)"/>
              </Flex>
            </Tooltip>
          </Flex>
        }
        description="Select a playback encryption option. Enable Clear or Digital Rights Management (DRM) copy protection during playback."
        name="encryption"
        data={ENCRYPTION_OPTIONS}
        placeholder="Select Encryption"
        mb={16}
        {...form.getInputProps("encryption")}
      />

      {
        !objectProbed &&
        <Alert
          variant="light"
          mt={24}
          mb={24}
          icon={<IconAlertCircle/>}
          classNames={{
            wrapper: styles.alertRoot
          }}
        >
          <Flex justify="space-between" align="center">
            <Text>
              To apply audio stream settings, object must be probed first.
            </Text>
            <Button
              variant="subtle"
              onClick={() => setShowProbeConfirmation(true)}
              disabled={
                objectData !== null ||
                DisableProbeButton()
              }
            >
              Probe
            </Button>
          </Flex>
        </Alert>
      }
      <Title order={3} c="elv-gray.8">Audio</Title>
      <AudioTracksTable
        records={audioTracks}
        audioFormData={audioFormData}
        setAudioFormData={setAudioFormData}
        disabled={!objectProbed}
      />
    </>
  );
});

const Create = observer(() => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [objectData, setObjectData] = useState(null);

  useEffect(() => {
    Promise.all([
      dataStore.LoadAccessGroups(),
      dataStore.LoadLibraries(),
      dataStore.LoadStreamUrls()
    ])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const LoadConfigData = async () => {
      const {audioStreams, audioData} = await dataStore.LoadStreamProbeData({
        objectId: objectData.objectId
      });

      setAudioTracks(audioStreams);
      setAudioFormData(audioData);
    };

    if(objectData !== null) {
      LoadConfigData();
    }
  }, [objectData, streamStore.streams]);

  // Controlled form values that need state variables
  const [formProtocol, setFormProtocol] = useState("mpegts");
  const [formUrl, setFormUrl] = useState("");
  const [formCustomUrl, setFormCustomUrl] = useState("");

  // Toggle values
  const [useAdvancedSettings, setUseAdvancedSettings] = useState("");
  const [showProbeConfirmation, setShowProbeConfirmation] = useState(false);

  // Form data dependent on api calls
  const [urlOptions, setUrlOptions] = useState([]);
  const [ladderProfilesData, setLadderProfilesData] = useState([]);
  const [audioFormData, setAudioFormData] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      accessGroup: "",
      customUrl: "", // Controlled by local state
      description: "",
      displayTitle: "",
      libraryId: "",
      name: "",
      permission: "editable",
      encryption: "clear",
      playoutProfile: "Default",
      protocol: "mpegts", // Controlled by local state
      retention: "86400",
      url: "" // Controlled by local state
    },
    validate: {
      name: isNotEmpty("Name is required"),
      url: (value, values) => values.protocol === "custom" ? null : value ? null : "URL is required",
      customUrl: (value, values) => values.protocol === "custom" ? value ? null : "Custom URL is required" : null,
      libraryId: isNotEmpty("Library is required"),
      description: (value) => ValidateTextField({value, key: "Description"}),
      displayTitle: (value) => ValidateTextField({value, key: "Display Title"})
    }
  });

  useEffect(() => {
    if(dataStore.ladderProfiles) {
      const defaultOption = dataStore.ladderProfiles?.default ?
        {
          label: dataStore.ladderProfiles.default.name,
          value: dataStore.ladderProfiles.default.name
        } : {};

      const options = [
        defaultOption,
        ...dataStore.ladderProfiles.custom.map(item => ({label: item.name, value: item.name}))
      ];

      setLadderProfilesData(options);
    }
  }, [dataStore.ladderProfiles]);

  useEffect(() => {
    const urls = formProtocol === "custom" ?
      [] :
      Object.keys(dataStore.liveStreamUrls || {})
        .filter(url => dataStore.liveStreamUrls[url].protocol === formProtocol && !dataStore.liveStreamUrls[url].active);

    setUrlOptions(urls);
  }, [formProtocol, dataStore.liveStreamUrls]);

  const HandleProbeConfirm = async() => {
    const {accessGroup, description, displayTitle, encryption, libraryId, name, permission, playoutProfile, protocol, retention} = form.getValues();

    const {objectId, slug} = await editStore.InitLiveStreamObject({
      accessGroup,
      description,
      displayTitle,
      encryption,
      libraryId,
      name,
      permission,
      playoutProfile,
      protocol,
      retention: retention ? parseInt(retention) : null,
      url: formProtocol === "custom" ? formCustomUrl : formUrl
    });

    await streamStore.ConfigureStream({objectId, slug});

    setObjectData({objectId, slug});

    notifications.show({
      title: "Probed stream",
      message: "Stream object was successfully created and probed"
    });
  };

  const HandleSubmit = async () => {
    setIsCreating(true);

    try {
      let objectId;
      const url = formProtocol === "custom" ? formCustomUrl : formUrl;
      const {accessGroup, description, displayTitle, encryption, libraryId, name, permission, playoutProfile, protocol, retention} = form.getValues();

      if(objectData === null) {
        // Stream hasn't been created
        const response = await editStore.InitLiveStreamObject({
          accessGroup,
          description,
          displayTitle,
          encryption,
          libraryId,
          name,
          permission,
          playoutProfile,
          protocol,
          retention: retention ? parseInt(retention) : null,
          url
        });

        objectId = response.objectId;
      } else {
        // Stream has already been created and probed
        objectId = objectData.objectId;
        await editStore.UpdateLiveStreamObject({
          objectId,
          slug: objectData.slug,
          audioFormData,
          accessGroup,
          description,
          displayTitle,
          encryption,
          libraryId,
          name,
          playoutProfile,
          protocol,
          retention: retention ? parseInt(retention) : null,
          url
        });
      }

      navigate(`/streams/${objectId}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <PageContainer
      title="Create Live Stream"
      className={(dataStore.tenantId && !rootStore.errorMessage) ? "" : styles.disabledContainer}
    >
      <form onSubmit={form.onSubmit(HandleSubmit)} style={{width: "700px"}}>
        <Radio.Group
          name="protocol"
          label="Streaming Protocol"
          description="Select a protocol to see available pre-allocated URLs."
          mb={16}
          value={formProtocol}
          onChange={(value) => {
            setFormProtocol(value);
            form.setFieldValue("protocol", value);
            setFormUrl("");
            form.setFieldValue("url", "");
          }}
        >
          <Stack mt="xs">
            <Radio
              value="mpegts"
              label="MPEG-TS"
              description="Perfect for low-latency and interactive streams, widely used in live broadcasting applications."
            />
            <Radio
              value="rtmp"
              label="RTMP"
              description="Reliable for stable broadcasts, ensuring high-quality video and audio transmission."
            />
            <Radio
              value="srt"
              label="SRT"
              description="Secure and adaptive, ideal for streaming over unpredictable networks with error recovery features."
            />
            <Radio
              value="custom"
              label="Custom"
              description="Enter a custom URL."
            />
          </Stack>
        </Radio.Group>
        {
          formProtocol === "custom" ?
            (
              <TextInput
                label="URL"
                name="customUrl"
                disabled={objectData !== null}
                value={formCustomUrl}
                onChange={event => {
                  const {value} = event.target;
                  setFormCustomUrl(value);
                  form.setFieldValue("customUrl", value);
                }}
                error={formProtocol === "custom" ? form.errors.customUrl : null}
                withAsterisk={formProtocol === "custom"}
                mb={16}
              />
            ) :
            (
              <Select
                key={formProtocol}
                label="URL"
                name="url"
                disabled={objectData !== null}
                data={urlOptions.map(url => (
                  {
                    label: url,
                    value: url
                  }
                ))}
                placeholder="Select URL"
                value={formUrl}
                onChange={(value) => {
                  setFormUrl(value);
                  form.setFieldValue("url", value);
                }}
                error={formProtocol !== "custom" ? form.errors.url : null}
                withAsterisk={formProtocol !== "custom"}
                mb={16}
              />
            )
        }
        <TextInput
          label="Name"
          name="name"
          mb={16}
          withAsterisk
          {...form.getInputProps("name")}
        />
        <TextInput
          label="Description"
          name="description"
          mb={16}
          {...form.getInputProps("description")}
        />
        <TextInput
          label="Display Title"
          name="displayTitle"
          mb={16}
          {...form.getInputProps("displayTitle")}
        />

        <Select
          label="Access Group"
          name="accessGroup"
          disabled={objectData !== null}
          description="This is the Access Group that will manage your live stream object."
          data={
            Object.keys(dataStore.accessGroups || {}).map(accessGroupName => (
              {
                label: accessGroupName,
                value: accessGroupName
              }
            ))
          }
          placeholder="Select Access Group"
          mb={16}
          {...form.getInputProps("accessGroup")}
        />

        <Permissions
          form={form}
        />

        <Select
          label="Library"
          name="libraryId"
          disabled={objectData !== null}
          description="Select the library where your live stream object will be created."
          required={true}
          data={
            Object.keys(dataStore.libraries || {}).map(libraryId => (
              {
                label: dataStore.libraries[libraryId].name || "",
                value: libraryId
              }
            ))
          }
          placeholder="Select Library"
          mb={16}
          {...form.getInputProps("libraryId")}
        />

        <Accordion
          value={useAdvancedSettings}
          onChange={setUseAdvancedSettings}
        >
          <Accordion.Item value="advanced-item">
            <Accordion.Control>Advanced Settings</Accordion.Control>
            <Accordion.Panel>
            <AdvancedSettingsPanel
              form={form}
              objectProbed={objectData !== null}
              audioTracks={audioTracks}
              audioFormData={audioFormData}
              setAudioFormData={setAudioFormData}
              setShowProbeConfirmation={setShowProbeConfirmation}
              objectData={objectData}
              ladderProfilesData={ladderProfilesData}
              loading={loading}
              DisableProbeButton={() => {
                const {libraryId, name} = form.getValues();

                return !(
                  (formCustomUrl || formUrl) &&
                  name &&
                  libraryId
                );
              }}
            />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Box mt="2rem" mb="2.5rem">
          <Button disabled={isCreating} type="submit">
            { isCreating ? "Submitting..." : "Save" }
          </Button>
        </Box>
      </form>

      <ConfirmModal
        show={showProbeConfirmation}
        CloseCallback={() => setShowProbeConfirmation(false)}
        title="Create and Probe Stream"
        message="Are you sure you want to probe the stream? This will also create the content object."
        loadingText={`Please send your stream to ${(formProtocol === "custom" ? formCustomUrl : formUrl) || "the URL you specified"}.`}
        ConfirmCallback={async () => {
          try {
            await HandleProbeConfirm();
            setShowProbeConfirmation(false);
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error("Unable to probe stream", error);
            throw Error(error);
          }
        }}
      />
    </PageContainer>
  );
});

export default Create;
