import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {dataStore, rootStore, streamManagementStore, profileStore} from "@/stores";
import {useNavigate} from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Flex,
  Select,
  SimpleGrid,
  Text,
  TextInput,
  Tooltip
} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {isNotEmpty, useForm} from "@mantine/form";
import {IconInfoCircle} from "@tabler/icons-react";

import PageContainer from "@/components/page-container/PageContainer.jsx";
import styles from "./Create.module.css";
import {ValidateTextField} from "@/utils/validators.js";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

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
              <IconInfoCircle color="var(--mantine-color-elv-gray-8)" />
            </Flex>
          </Tooltip>
        </Flex>
      }
      description="Stream permission level."
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
      {...form.getInputProps("permission")}
    />
  );
});

const Create = observer(() => {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const promises = [
      dataStore.LoadAccessGroups(),
      dataStore.LoadLibraries(),
      dataStore.LoadStreamUrls()
    ];

    if(profileStore.state !== "loaded") {
      promises.push(profileStore.LoadProfiles());
    }

    Promise.all(promises)
      .then(() => {});
  }, []);

  // Controlled form values that need state variables
  const [formProtocol, setFormProtocol] = useState("mpegts");
  const [formUrl, setFormUrl] = useState("");
  const [formCustomUrl, setFormCustomUrl] = useState("");

  // Form data dependent on api calls
  const [urlOptions, setUrlOptions] = useState([]);
  const [profilesData, setProfilesData] = useState([]);

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
      encryption: ["hls-clear", "dash-clear"],
      configProfile: "",
      protocol: "mpegts", // Controlled by local state
      retention: "86400",
      url: "" // Controlled by local state
    },
    validate: {
      name: isNotEmpty("Name is required"),
      url: (value, values) => values.protocol === "custom" ? null : value ? null : "URL is required",
      customUrl: (value, values) => values.protocol === "custom" ? value ? null : "Custom URL is required" : null,
      libraryId: isNotEmpty("Library is required"),
      description: (value) => value ? ValidateTextField({value, key: "Description"}) : null,
      displayTitle: (value) => value ? ValidateTextField({value, key: "Display Title"}) : null
    }
  });

  useEffect(() => {
    if(profileStore.profiles) {
      const options = Object.keys(profileStore.sortedProfiles)
        .map(item => ({label: profileStore.profiles[item]?.name, value: item}));

      setProfilesData(options);
    }
  }, [profileStore.profiles]);

  useEffect(() => {
    const urls = formProtocol === "custom" ?
      [] :
      Object.keys(dataStore.liveStreamUrls || {})
        .filter(url => dataStore.liveStreamUrls[url].protocol === formProtocol && !dataStore.liveStreamUrls[url].active);

    setUrlOptions(urls);
  }, [formProtocol, dataStore.liveStreamUrls]);

  const HandleSubmit = async () => {
    setIsCreating(true);

    try {
      const url = formProtocol === "custom" ? formCustomUrl : formUrl;
      const {accessGroup, description, displayTitle, encryption, libraryId, name, permission, configProfile, protocol, retention} = form.getValues();

      let retentionData = null;
      let persistent = false;

      if(retention) {
        if(retention === "indefinite") {
          persistent = true;
        } else {
          retentionData = parseInt(retention);
        }
      }

      const {objectId: responseObjectId} = await streamManagementStore.InitLiveStreamObject({
        accessGroup,
        description,
        displayTitle,
        encryption,
        libraryId,
        name,
        permission,
        configProfile: configProfile ? profileStore.profiles[configProfile] : undefined,
        protocol,
        retention: retentionData,
        persistent,
        url
      });

      navigate(`/streams/${responseObjectId}`);
    } catch(error) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to create live stream"
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <PageContainer
      title="Create Live Stream"
      className={(dataStore.tenantId && !rootStore.errorMessage) ? "" : styles.disabledContainer}
    >
      <form onSubmit={form.onSubmit(HandleSubmit)} className={styles.form}>
        <SectionTitle mb={2}>Streaming Protocol</SectionTitle>
        <Text fz={12} c="elv-gray.6" mb={10}>Select a protocol to see available pre-allocated URLs.</Text>
        <Select
          name="protocol"
          label="Protocol"
          required={true}
          value={formProtocol}
          data={[
            {label: "MPEG-TS", value: "mpegts"},
            {label: "RTMP", value: "rtmp"},
            {label: "SRT", value: "srt"},
            {label: "Custom", value: "custom"}
          ]}
          onChange={(value) => {
            setFormProtocol(value);
            form.setFieldValue("protocol", value);
            setFormUrl("");
            form.setFieldValue("url", "");
          }}
          mb={18}
        />

        <Box mb={29}>
          {
            formProtocol === "custom" ?
              (
                <TextInput
                  label="URL"
                  name="customUrl"
                  placeholder="Enter a custom URL"
                  value={formCustomUrl}
                  onChange={event => {
                    const {value} = event.target;
                    setFormCustomUrl(value);
                    form.setFieldValue("customUrl", value);
                  }}
                  error={formProtocol === "custom" ? form.errors.customUrl : null}
                  withAsterisk={formProtocol === "custom"}
                />
              ) :
              (
                <Select
                  key={formProtocol}
                  label="URL"
                  name="url"
                  data={urlOptions.map(url => (
                    {
                      label: url,
                      value: url
                    }
                  ))}
                  placeholder={dataStore.loadedUrls ? "Select URL" : "Loading URLs..."}
                  value={formUrl}
                  onChange={(value) => {
                    setFormUrl(value);
                    form.setFieldValue("url", value);
                  }}
                  error={formProtocol !== "custom" ? form.errors.url : null}
                  withAsterisk={formProtocol !== "custom"}
                />
              )
          }
        </Box>

        <Divider mb={29} />
        <SectionTitle mb={10}>General</SectionTitle>

        <SimpleGrid cols={2} spacing={150} mb={18}>
          <TextInput
            label="Name"
            name="name"
            placeholder="Enter stream name"
            withAsterisk
            {...form.getInputProps("name")}
          />
          <TextInput
            label="Display Title"
            name="displayTitle"
            placeholder="Enter a title"
            {...form.getInputProps("displayTitle")}
          />
        </SimpleGrid>
        <TextInput
          label="Description"
          name="description"
          placeholder="Enter a description"
          description="Enter a description to provide more details and context."
          mb={29}
          {...form.getInputProps("description")}
        />
        <SimpleGrid cols={2} spacing={150} mb={29}>
          <Select
            key={profilesData}
            label="Config Profile"
            name="configProfile"
            data={profilesData}
            placeholder={profileStore.state === "loaded" ? "Select Config Profile" : "Loading Profiles..."}
            description={
              profileStore.state !== "loaded" ? "Apply a predefined set of configuration settings to this stream." : (profilesData.length === 0) ? "No profiles are configured. Create a profile in Settings." : "Apply a predefined set of configuration settings to this stream. If no profile is selected, built-in settings will be applied."
            }
            {...form.getInputProps("configProfile")}
            clearable
          />
        </SimpleGrid>

        <Divider mb={29} />
        <SectionTitle mb={10}>Access</SectionTitle>

        <SimpleGrid cols={2} spacing={150} mb={12}>
          <Select
            label="Access Group"
            name="accessGroup"
            description="Access Group responsible for managing your live stream object."
            data={
              Object.keys(dataStore.accessGroups || {}).map(accessGroupName => (
                {
                  label: accessGroupName,
                  value: accessGroupName
                }
              ))
            }
            placeholder="Select Access Group"
            {...form.getInputProps("accessGroup")}
          />

          <Permissions
            form={form}
          />
        </SimpleGrid>

        <Select
          label="Library"
          name="libraryId"
          description="Select the library where your live stream object will be stored."
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
          mb={29}
          {...form.getInputProps("libraryId")}
        />

        <Box mt={25} mb="2.5rem">
          <Button disabled={isCreating} type="submit" size="sm">
            { isCreating ? "Submitting..." : "Save" }
          </Button>
        </Box>
      </form>
    </PageContainer>
  );
});

export default Create;
