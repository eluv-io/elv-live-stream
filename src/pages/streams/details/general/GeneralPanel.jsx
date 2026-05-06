import {observer} from "mobx-react-lite";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Loader,
  Select,
  SimpleGrid,
  Text,
  TextInput,
  Tooltip
} from "@mantine/core";
import {useEffect, useState} from "react";
import {dataStore, streamEditStore, streamStore, profileStore} from "@/stores/index.js";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import {STATUS_MAP} from "@/utils/constants.js";
import {IconInfoCircle} from "@tabler/icons-react";

const GeneralPanel = observer(({slug, currentConfigProfile, status}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    displayTitle: "",
    accessGroup: "",
    permission: "",
    url: "",
  });
  const [configProfile, setConfigProfile] = useState(currentConfigProfile || "");
  const [applyConfigProfile, setApplyConfigProfile] = useState(false);
  const [profilesData, setProfilesData] = useState([]);

  const [applyingChanges, setApplyingChanges] = useState(false);
  const [applyingProfileChanges, setApplyingProfileChanges] = useState(false);
  const [currentSettings, setCurrentSettings] = useState({
    accessGroup: "",
    permission: ""
  });

  const [loading, setLoading] = useState(false);
  const params = useParams();

  useEffect(() => {
    const LoadData = async() => {
      try {
        setLoading(true);
        const libraryId = streamStore.streams[slug]?.libraryId;
      await streamStore.LoadGeneralConfigData({objectId: params.id, libraryId, slug});
        const stream = streamStore.streams[slug];

        setFormData({
          name: stream.title || "",
          description: stream.description || "",
          displayTitle: stream.display_title || "",
          permission: stream.permission || "",
          accessGroup: stream.accessGroup || "",
          url: stream.originUrl || ""
        });

        setConfigProfile(stream.configProfile || "");

        setCurrentSettings({
          permission: stream.permission || "",
          accessGroup: stream.accessGroup || ""
        });
      } finally {
        setLoading(false);
      }
    };

    if(params.id) {
      dataStore.LoadAccessGroups();
      LoadData();
    }
  }, [params.id]);

  useEffect(() => {
    if(profileStore.state !== "loaded") {
      profileStore.LoadProfiles().then(() => {});
    }

    if(profileStore.profiles) {
      const options = Object.keys(profileStore.sortedProfiles)
        .map(item => ({label: profileStore.profiles[item]?.name, value: item}));

      setProfilesData(options);
    }
  }, [profileStore.sortedProfiles]);

  const HandleFormChange = (event) => {
    const {name, value} = event.target;

    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const HandleSubmit = async(event) => {
    event.preventDefault();

    try {
      setApplyingChanges(true);

      await streamEditStore.UpdateGeneralConfig({
        objectId: params.id,
        slug,
        formData,
        configProfile,
        updatePermission: currentSettings.permission !== formData.permission,
        updateAccessGroup: currentSettings.accessGroup !== formData.accessGroup,
        removeAccessGroup: currentSettings.accessGroup
      });

      notifications.show({
        title: <NotificationMessage>Updated {formData.name || params.id}</NotificationMessage>,
        message: "Changes have been applied successfully"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update metadata", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to save changes"
      });
    } finally {
      setApplyingChanges(false);
    }
  };

  if(loading) { return <Loader />; }

  return (
    <>
      <Flex direction="column" style={{flexGrow: "1"}}>
        <SectionTitle mb={12}>General</SectionTitle>
        <form onSubmit={HandleSubmit}>
          <Box mb="24px" maw="80%">
            <SimpleGrid cols={1} spacing={150} mb={18}>
              <TextInput
                label="URL"
                name="url"
                placeholder="Enter a URL"
                required={true}
                value={formData.url}
                onChange={HandleFormChange}
              />
            </SimpleGrid>
            <SimpleGrid cols={2} spacing={150} mb={18}>
              <TextInput
                label="Name"
                name="name"
                placeholder="Enter stream name"
                required={true}
                value={formData.name}
                onChange={HandleFormChange}
              />
              <TextInput
                label="Display Title"
                name="displayTitle"
                placeholder="Enter a title"
                value={formData.displayTitle}
                onChange={HandleFormChange}
              />
            </SimpleGrid>
            <TextInput
              label="Description"
              name="description"
              placeholder="Enter a description"
              description="Enter a description to provide more details and context."
              value={formData.description}
              onChange={HandleFormChange}
              mb={29}
            />

            <DisabledTooltipWrapper
              disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.UNCONFIGURED].includes(status)}
              tooltipLabel="Profile configuration is disabled while the stream is active"
            >
              <Box mb={29}>
                <SimpleGrid cols={2} spacing={150}>
                  <Select
                    label="Config Profile"
                    name="configProfile"
                    data={[
                      {label: "Built-in Configuration", value: ""},
                      ...profilesData
                    ]}
                    mb={12}
                    placeholder={profileStore.state === "loaded" ? "Select Config Profile" : "Loading Profiles..."}
                    description={(profilesData.length > 0 || profileStore.state !== "loaded") ? "Apply a predefined set of configuration settings to this stream." : "No profiles are configured. Create a profile in Settings."}
                    value={configProfile}
                    onChange={(value) => setConfigProfile(value)}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                <Checkbox
                  label="Apply profile settings and overwrite current stream configuration"
                  size="xs"
                  checked={applyConfigProfile}
                  onChange={(event) => setApplyConfigProfile(event.target.checked)}
                />
                {
                  (profileStore.profiles[currentConfigProfile]?.last_updated > streamStore.streams[slug]?.profileLastUpdated) ?
                    <Box>
                      <Text c="elv-gray.9" mb={12} mt={12} fz={14}>Profile has been changed.</Text>
                      <Button
                        variant="outline"
                        disabled={applyingProfileChanges}
                        onClick={async() => {
                          try {
                            setApplyingProfileChanges(true);
                            await streamEditStore.ApplyStreamProfile({
                              objectId: params.id,
                              profileSlug: currentConfigProfile
                            });
                            await streamStore.LoadDetails({
                              objectId: params.id,
                              slug
                            });
                        } finally {
                          setApplyingProfileChanges(false);
                        }
                      }}
                      >Re-apply
                      </Button>
                    </Box> : null
                }
              </Box>
            </DisabledTooltipWrapper>

            <Divider mb={29} />

            <SectionTitle mb={12}>Access</SectionTitle>
            <SimpleGrid cols={2} spacing={150} mb={25}>
              <Select
                label="Access Group"
                description="Access Group responsible for managing your live stream object."
                name="accessGroup"
                data={
                  Object.keys(dataStore.accessGroups || {}).map(accessGroupName => (
                    {
                      label: accessGroupName,
                      value: dataStore.accessGroups[accessGroupName]?.address
                    }
                  ))
                }
                value={formData.accessGroup}
                placeholder="Select Access Group"
                onChange={(value) => HandleFormChange({
                    target: {name: "accessGroup", value}
                  }
                )}
              />
              <Select
                label={
                  <Flex align="center" gap={6}>
                    Permission
                    <Tooltip
                      multiline
                      w={460}
                      label={
                        Object.values(dataStore.client.permissionLevels).map(({short, description}) =>
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
                value={formData.permission}
                onChange={(value) => HandleFormChange({
                  target: {name: "permission", value}}
                )}
                data={
                  Object.keys(dataStore.client.permissionLevels || {}).map(permissionName => (
                    {
                      label: dataStore.client.permissionLevels[permissionName].short,
                      value: permissionName
                    }
                  ))
                }
                allowDeselect={false}
              />
            </SimpleGrid>
          </Box>
          <Button
            type="submit"
            disabled={
            !formData.name ||
              !formData.url ||
              applyingChanges ||
              (!!configProfile && configProfile !== currentConfigProfile && !applyConfigProfile)}
            loading={applyingChanges}
          >
            Save
          </Button>
        </form>
      </Flex>
    </>
  );
});

export default GeneralPanel;
