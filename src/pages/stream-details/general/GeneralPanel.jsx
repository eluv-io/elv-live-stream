import {observer} from "mobx-react-lite";
import {Box, Button, Divider, Flex, Loader, Select, SimpleGrid, Text, TextInput, Tooltip} from "@mantine/core";
import {useEffect, useState} from "react";
import {dataStore, editStore, rootStore, streamStore} from "@/stores";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";
import {CircleInfoIcon} from "@/assets/icons/index.js";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

const GeneralPanel = observer(({slug}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    displayTitle: "",
    accessGroup: "",
    permission: "",
    url: ""
  });
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [currentSettings, setCurrentSettings] = useState({
    accessGroup: "",
    permission: ""
  });
  const [loading, setLoading] = useState(false);

  const params = useParams();

  useEffect(() => {
    const LoadDetails = async() => {
      try {
        setLoading(true);
        await dataStore.LoadDetails({objectId: params.id, slug});
        const stream = streamStore.streams[slug];
        const currentPermission = await dataStore.LoadPermission({objectId: params.id});
        const accessGroupPermission = await dataStore.LoadAccessGroupPermissions({objectId: params.id});

        setFormData({
          name: stream.title || "",
          description: stream.description || "",
          displayTitle: stream.display_title || "",
          permission: currentPermission || "",
          accessGroup: accessGroupPermission || "",
          url: stream.originUrl || ""
        });

        setCurrentSettings({
          permission: currentPermission || "",
          accessGroup: accessGroupPermission || ""
        });
      } finally {
        setLoading(false);
      }
    };

    const LoadAccessGroups = async() => {
      await dataStore.LoadAccessGroups();
    };

    if(params.id) {
      LoadAccessGroups();
      LoadDetails();
    }
  }, [params.id, streamStore.streams]);

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

      await editStore.UpdateDetailMetadata({
        objectId: params.id,
        name: formData.name,
        url: formData.url,
        description: formData.description,
        displayTitle: formData.displayTitle
      });

      if(currentSettings.permission !== formData.permission) {
        await editStore.SetPermission({
          objectId: params.id,
          permission: formData.permission
        });
      }

      if(currentSettings.accessGroup !== formData.accessGroup) {
        await editStore.UpdateAccessGroupPermission({
          objectId: params.id,
          addGroup: formData.accessGroup,
          removeGroup: currentSettings.accessGroup
        });
      }

      notifications.show({
        title: `${formData.name || params.id} updated`,
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
                description="Stream permission level."
                name="permission"
                placeholder="Select Permission"
                value={formData.permission}
                onChange={(value) => HandleFormChange({
                  target: {name: "permission", value}}
                )}
                data={
                  Object.keys(rootStore.client.permissionLevels || {}).map(permissionName => (
                    {
                      label: rootStore.client.permissionLevels[permissionName].short,
                      value: permissionName
                    }
                  ))
                }
              />
            </SimpleGrid>
          </Box>
          <Button type="submit" disabled={!formData.name || !formData.url || applyingChanges} loading={applyingChanges}>
            Save
          </Button>
        </form>
      </Flex>
    </>
  );
});

export default GeneralPanel;
