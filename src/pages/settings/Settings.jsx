import {Box, Button, Flex, Group, Loader, Text} from "@mantine/core";
import TextEditorBox from "@/components/text-editor-box/TextEditorBox.jsx";
import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {profileStore} from "@/stores/index.js";
import {PlusIcon} from "@/assets/icons/index.js";
import {notifications} from "@mantine/notifications";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import styles from "./Settings.module.css";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

const Settings = observer(() => {
  // Used to provide ConfirmModal with slug to be deleted
  const [pendingDeleteSlug, setPendingDeleteSlug] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    profileStore.LoadProfiles();
  }, []);


  const HandleDeleteProfile = async({slug}) => {
    try {
      await profileStore.DeleteProfile(slug);

      notifications.show({
        title: "Profile deleted",
        message: "Config profiles successfully updated"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to delete config profile", error);

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

      await profileStore.SaveProfiles();

      notifications.show({
        title: "Profile data changed",
        message: "Config profiles successfully updated"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update profiles", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: `${error}` || "Unable to apply settings"
      });
    } finally {
      setSaving(false);
    }
  };

  if(profileStore.state === "pending") { return <Flex mt={12} justify="center"><Loader /></Flex>; }

  return (
    <PageContainer
      title="Settings"
    >
      <Box mt={22}>
        <Group mb={12} gap={16}>
          <SectionTitle>Config Profiles</SectionTitle>
          <Button
            classNames={{root: styles.root, section: styles.buttonSection}}
            leftSection={<PlusIcon width={18} height={18} />}
            variant="white"
            // onClick={HandleAddCustom}
          >
            <Text fw={500} fz={14} c="elv-blue.2">
              Add Profile
            </Text>
          </Button>
        </Group>

        {
          Object.entries(profileStore.drafts).map(([key, value]) => (
            <TextEditorBox
              key={`custom-${key}`}
              columns={[
                {id: key, value: value.name || {}}
              ]}
              header="Profile"
              editorValue={JSON.stringify(value, null, 2)}
              HandleEditorValueChange={({value}) => profileStore.UpdateDraft(key, value)}
              HandleReset={() => profileStore.ResetProfile(key)}
              HandleDelete={() => {
                setPendingDeleteSlug(key);
                setShowModal(true);
              }}
            />
          ))
        }
        {
          Object.keys(profileStore.profiles).length === 0 ?
            "No profiles created" : null
        }
      </Box>
      {
        Object.keys(profileStore.profiles).length > 0 &&
        <Button
          variant="filled"
          onClick={HandleSave}
          disabled={saving}
          loading={saving}
          mt={5}
        >
          Save
        </Button>
      }
      <ConfirmModal
        title="Delete Profile"
        message="Are you sure you want to delete the profile? This action cannot be undone."
        confirmText="Delete"
        danger
        show={showModal}
        CloseCallback={() => setShowModal(false)}
        ConfirmCallback={async() => {
          await HandleDeleteProfile({slug: pendingDeleteSlug});
          profileStore.DeleteProfile(pendingDeleteSlug);
          setPendingDeleteSlug(null);
          setShowModal(false);
        }}
      />
    </PageContainer>
  );
});

export default Settings;
