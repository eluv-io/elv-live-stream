import {observer} from "mobx-react-lite";
import {Box, Flex, Loader, Text} from "@mantine/core";
import {useEffect, useState} from "react";
import {dataStore, editStore, rootStore, streamStore} from "@/stores";
import {useParams} from "react-router-dom";
import {Select, TextInput} from "@/components/Inputs.jsx";
import {notifications} from "@mantine/notifications";

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
        <form className="form" onSubmit={HandleSubmit}>
          <Box mb="24px" maw="70%">
            <TextInput
              label="Name"
              formName="name"
              required={true}
              value={formData.name}
              onChange={HandleFormChange}
            />
            <TextInput
              label="Display Title"
              formName="displayTitle"
              value={formData.displayTitle}
              onChange={HandleFormChange}
            />
            <TextInput
              label="Description"
              formName="description"
              value={formData.description}
              onChange={HandleFormChange}
            />
            <Select
              label="Access Group"
              labelDescription="This is the Access Group that will manage your live stream object."
              formName="accessGroup"
              options={
                Object.keys(dataStore.accessGroups || {}).map(accessGroupName => (
                  {
                    label: accessGroupName,
                    value: dataStore.accessGroups[accessGroupName]?.address
                  }
                ))
              }
              value={formData.accessGroup}
              defaultOption={{
                value: "",
                label: "Select Access Group"
              }}
              onChange={HandleFormChange}
            />
            <Select
              label="Permission"
              labelDescription="Set a permission level."
              formName="permission"
              tooltip={
                Object.values(rootStore.client.permissionLevels).map(({short, description}) =>
                  <Flex
                    key={`permission-info-${short}`}
                    gap="1rem"
                    lh={1.25}
                    pb={5}
                    maw={500}
                  >
                    <Flex flex="0 0 25%">{ short }:</Flex>
                    <Text fz="sm">{ description }</Text>
                  </Flex>
                )
              }
              value={formData.permission}
              onChange={HandleFormChange}
              options={
                Object.keys(rootStore.client.permissionLevels || {}).map(permissionName => (
                  {
                    label: rootStore.client.permissionLevels[permissionName].short,
                    value: permissionName
                  }
                ))
              }
            />
          </Box>
          <button type="submit" className="button__primary" disabled={applyingChanges}>
            {applyingChanges ? <Loader type="dots" size="xs" style={{margin: "0 auto"}} /> : "Save"}
          </button>
        </form>
      </Flex>
    </>
  );
});

export default GeneralPanel;
