import {Box, Button, Group, Stack, Text} from "@mantine/core";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import styles from "@/pages/settings/Settings.module.css";
import {PlusIcon} from "@/assets/icons/index.js";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {useEffect, useState} from "react";
import {dataStore, streamManagementStore} from "@/stores/index.js";
import {DefaultLadderProfile} from "@/utils/profiles.js";
import {notifications} from "@mantine/notifications";
import {observer} from "mobx-react-lite";
import PlayoutProfileEditor from "@/components/text-editor-box/TextEditorBox.jsx";

const PlayoutProfiles = observer(() => {
  const [profileFormData, setProfileFormData] = useState(({default: JSON.stringify({}, null, 2), custom: []}));
  // For displaying values while user potentially edits name
  const [customProfileNames, setCustomProfileNames] = useState([]);
  // For tracking profiles that haven't been saved
  const [draftItems, setDraftItems] = useState({});

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

    // Add draft item
    const updatedDraftItems = Object.assign({}, draftItems);
    updatedDraftItems[updatedCustomItems.length - 1] = true;

    setDraftItems(updatedDraftItems);
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

      if(!draftItems[index]) {
        await streamManagementStore.SaveLadderProfiles({
          profileData: newData
        });
      }

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
      // Check for JSON validation errors first
      [
        profileFormData.default,
        ...profileFormData.custom || []
      ].forEach(profile => JSON.parse(profile));

      setSaving(true);

      await streamManagementStore.SaveLadderProfiles({
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
        message: `${error}` || "Unable to apply settings"
      });
    } finally {
      setSaving(false);
      setDraftItems({});
    }
  };

  return (
    <div>
      <Box mt={22}>
        <Group mb={12} gap={16}>
          <SectionTitle>Playout Profiles</SectionTitle>
          <Button
            classNames={{root: styles.root, section: styles.buttonSection}}
            leftSection={<PlusIcon width={18} height={18} />}
            variant="white"
            onClick={HandleAddCustom}
          >
            <Text fw={500} fz={14} c="elv-blue.2">
              Add Custom Profile
            </Text>
          </Button>
        </Group>

        <PlayoutProfileEditor
          title="Default"
          value={profileFormData.default ?? {}}
          audioLabel={profileFormData.default?.ladder_specs?.audio?.length ?? null}
          videoLabel={profileFormData?.default.ladder_specs?.video?.length ?? null}
          HandleEditorValueChange={(args) => HandleChange({...args, index: "default"})}
          hideDelete
          defaultShowEditor
        />
        <Stack>
          {
            (profileFormData.custom).map((profile, index) => {
              const profileObject = JSON.parse(profile, null, 2);

              return (
                <PlayoutProfileEditor
                  key={`custom-${customProfileNames[index]}`}
                  title={customProfileNames[index]}
                  audioLabel={profileObject.ladder_specs?.audio?.length ?? null}
                  videoLabel={profileObject.ladder_specs?.video?.length ?? null}
                  value={profile}
                  HandleEditorValueChange={(args) => HandleChange({...args, index})}
                  HandleDelete={() => {
                    setShowModal(true);
                    setDeleteIndex(index);
                  }}
                />
              );
            })
          }
        </Stack>
      </Box>
      <Button
        variant="filled"
        onClick={HandleSave}
        disabled={saving}
        loading={saving}
        mt={5}
      >
        Save
      </Button>
      <ConfirmModal
        title="Delete Profile"
        message="Are you sure you want to delete the profile? This action cannot be undone."
        confirmText="Delete"
        danger
        show={showModal}
        CloseCallback={() => setShowModal(false)}
        ConfirmCallback={async() => {
          await HandleDeleteProfile({index: deleteIndex});
          setShowModal(false);
        }}
      />
    </div>
  );
});

export default PlayoutProfiles;
