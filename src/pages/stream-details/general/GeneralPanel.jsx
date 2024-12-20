import {observer} from "mobx-react-lite";
import {Box, Flex, Loader, Select, Text, TextInput, Tooltip} from "@mantine/core";
import {useEffect, useState} from "react";
import {dataStore, editStore, rootStore, streamStore} from "@/stores";
import {useParams} from "react-router-dom";
import {notifications} from "@mantine/notifications";
import ElvButton from "@/components/button/ElvButton.jsx";
import {CircleInfoIcon} from "@/assets/icons/index.js";

const GeneralPanel = observer(({slug}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    displayTitle: "",
    accessGroup: "",
    permission: ""
  });
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [currentSettings, setCurrentSettings] = useState({
    accessGroup: "",
    permission: ""
  });

  const params = useParams();

  useEffect(() => {
    const LoadDetails = async() => {
      await dataStore.LoadDetails({objectId: params.id, slug});
      const stream = streamStore.streams[slug];
      const currentPermission = await dataStore.LoadPermission({objectId: params.id});
      const accessGroupPermission = await dataStore.LoadAccessGroupPermissions({objectId: params.id});

      setFormData({
        name: stream.title || "",
        description: stream.description || "",
        displayTitle: stream.display_title || "",
        permission: currentPermission || "",
        accessGroup: accessGroupPermission || ""
      });

      setCurrentSettings({
        permission: currentPermission || "",
        accessGroup: accessGroupPermission || ""
      });
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

  return (
    <>
      <Flex direction="column" style={{flexGrow: "1"}}>
        <form onSubmit={HandleSubmit}>
          <Box mb="24px" w="700px">
            <TextInput
              label="Name"
              name="name"
              required={true}
              value={formData.name}
              onChange={HandleFormChange}
              mb={16}
            />
            <TextInput
              label="Display Title"
              name="displayTitle"
              value={formData.displayTitle}
              onChange={HandleFormChange}
              mb={16}
            />
            <TextInput
              label="Description"
              name="description"
              value={formData.description}
              onChange={HandleFormChange}
              mb={16}
            />
            <Select
              label="Access Group"
              description="This is the Access Group that will manage your live stream object."
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
              mb={16}
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
              description="Set a permission level."
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
              mb={16}
            />
          </Box>
          <ElvButton type="submit" disabled={applyingChanges}>
            {applyingChanges ? <Loader type="dots" size="xs" style={{margin: "0 auto"}} color="white" /> : "Save"}
          </ElvButton>
        </form>
      </Flex>
    </>
  );
});

export default GeneralPanel;
