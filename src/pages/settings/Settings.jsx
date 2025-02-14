import {Box, Button, Loader, Title} from "@mantine/core";
import TextEditorBox from "@/components/text-editor-box/TextEditorBox.jsx";
import {useEffect, useState} from "react";
import {DefaultLadderProfile} from "@/utils/profiles.js";
import {observer} from "mobx-react-lite";
import {dataStore, editStore} from "@/stores/index.js";
import {PlusIcon} from "@/assets/icons/index.js";
import {rootStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";

const Settings = observer(() => {
  const [profileFormData, setProfileFormData] = useState(({default: JSON.stringify({}, null, 2), custom: []}));
  // For displaying values while user potentionally edits name
  const [customProfileNames, setCustomProfileNames] = useState([]);
  const [deleteIndex, setDeleteIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const LoadData = async() => {
      if(dataStore.ladderProfiles) {
        const stringifiedProfiles = {
          default: JSON.stringify(dataStore.ladderProfiles.default, null, 2),
          custom: dataStore.ladderProfiles.custom.map(item => JSON.stringify(item, null, 2))
        };
        setProfileFormData(stringifiedProfiles);
        setCustomProfileNames(dataStore.ladderProfiles.custom.map(item => item.name));
      } else {
        const profilesObject = {
          default: JSON.stringify(DefaultLadderProfile, null, 2),
          custom: []
        };
        await setProfileFormData(profilesObject);
      }
    };

    LoadData();
  }, [dataStore.ladderProfiles]);

  const HandleChange = ({value, index}) => {
    const updatedFormData = profileFormData;
    const updatedCustomItems = updatedFormData.custom;

    if(index === "default") {
      updatedFormData.default = value;
    } else {
      updatedCustomItems[index] = value;
    }

    setProfileFormData({
      ...profileFormData,
      custom: updatedCustomItems
    });
  };

  const HandleAddCustom = async () => {
    const updatedCustomItems = profileFormData.custom;
    const newName = `Custom ${profileFormData.custom.length + 1}`;

    updatedCustomItems.push(
      JSON.stringify({
        "name" : `${newName}`,
        "ladder_specs": {
          "video": []
        }
      }, null, 2)
    );

    setProfileFormData({
      ...profileFormData,
      custom: updatedCustomItems
    });

    setCustomProfileNames(updatedCustomItems.map(item => JSON.parse(item).name));
  };

  const HandleDeleteProfile = async({index}) => {
    try {
      let updatedCustomItems = [...profileFormData.custom];
      updatedCustomItems = updatedCustomItems.slice(0, index).concat(updatedCustomItems.slice(index + 1));

      const newData = {
        ...profileFormData,
        custom: updatedCustomItems
      };

      await editStore.SaveLadderProfiles({
        profileData: newData
      });

      setCustomProfileNames(updatedCustomItems.map(item => JSON.parse(item).name));

      notifications.show({
        title: "Profile deleted",
        message: "Playout profiles successfully updated"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to delete playout profile", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to apply settings"
      });
    }
  };

  const HandleSave = async() => {
    try {
      setSaving(true);

      await editStore.SaveLadderProfiles({
        profileData: {...profileFormData}
      });

      notifications.show({
        title: "Profile data changed",
        message: "Playout profiles successfully updated"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update playout profiles", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to apply settings"
      });
    } finally {
      setSaving(false);
    }
  };

  if(!rootStore.loaded) { return <Loader />; }

  return (
    <>
      <div className="page-header monitor__page-header">
        <div>
          Settings
        </div>
      </div>
      <Box>
        <Title order={4}>Playout Profiles</Title>
        <Button
          leftSection={<PlusIcon />}
          variant="white"
          mt={16}
          mb={8}
          onClick={HandleAddCustom}
        >
          Add Custom Profile
        </Button>
        <TextEditorBox
          columns={[
            {id: "Default", header: "Profile", value: "Default"}
          ]}
          hideDelete
          editorValue={profileFormData.default || {}}
          HandleEditorValueChange={(args) => HandleChange({...args, index: "default"})}
        />
        {
          (profileFormData.custom).map((profile, index) => (
            <TextEditorBox
              key={`custom-${customProfileNames[index]}`}
              columns={[
                {id: customProfileNames[index], header: "Profile", value: customProfileNames[index]}
              ]}
              editorValue={profile}
              HandleEditorValueChange={(args) => HandleChange({...args, index})}
              HandleDelete={() => {
                setShowModal(true);
                setDeleteIndex(index);
              }}
            />
          ))
        }
      </Box>
      <button
        type="button"
        className="button__primary"
        onClick={HandleSave}
        disabled={saving}
      >
        {saving ? <Loader type="dots" size="xs" style={{margin: "0 auto"}} /> : "Save"}
      </button>
      <ConfirmModal
        title="Delete Profile"
        message="Are you sure you want to delete the profile? This action cannot be undone."
        confirmText="Delete"
        show={showModal}
        CloseCallback={() => setShowModal(false)}
        ConfirmCallback={async() => {
          await HandleDeleteProfile({index: deleteIndex});
          setShowModal(false);
        }}
      />
    </>
  );
});

export default Settings;
