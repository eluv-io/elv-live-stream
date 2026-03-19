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
import {Slugify} from "@/utils/helpers.js";

const Settings = observer(() => {
  // Used to provide ConfirmModal with slug to be deleted
  const [pendingDeleteSlug, setPendingDeleteSlug] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [validationError, setValidationError] = useState(false);

  useEffect(() => {
    profileStore.LoadProfiles();
  }, []);

  const HandleAddProfile = () => {
    profileStore.AddDraft();
  };

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
            onClick={HandleAddProfile}
          >
            <Text fw={500} fz={14} c="elv-blue.2">
              Add Profile
            </Text>
          </Button>
        </Group>

        {
          Object.entries(profileStore.sortedDrafts).map(([key, value]) => (
            <TextEditorBox
              key={`custom-${key}`}
              columns={[
                {id: key, value: value.name || "Profile"}
              ]}
              header="Profile"
              editorValue={JSON.stringify(value, null, 2)}
              HandleEditorValueChange={({value}) => profileStore.UpdateDraft(key, value)}
              HandleDelete={() => {
                setPendingDeleteSlug(key);
                setShowModal(true);
              }}
              Validate={parsed => {
                let errorMessage;
                if(!parsed.name) {
                  errorMessage = "A \"name\" field is required";
                  setValidationError(true);
                }
                  const duplicate = Object.values(profileStore.sortedDrafts)
                    .some(d => d.name === parsed.name && Slugify(d.name) !== key);

                if(duplicate) {
                  errorMessage = "A profile with this name already exists";
                  setValidationError(true);
                }

                if(!errorMessage) {
                  setValidationError(false);
                }

                return errorMessage ?? null;
              }}
            />
          ))
        }
        {
          (Object.keys(profileStore.profiles).length === 0  && Object.keys(profileStore.drafts).length === 0) ?
            <Text mb={12}>No profiles found. Click &#39;Add Profile&#39; to begin setup.</Text> : null
        }
      </Box>
      {
        Object.keys(profileStore.drafts).length > 0 &&
        <Button
          variant="filled"
          onClick={HandleSave}
          disabled={saving || validationError}
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
