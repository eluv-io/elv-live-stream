import {ActionIcon, Box, Button, CopyButton, Flex, Group, JsonInput, Loader, Text, Tooltip} from "@mantine/core";
import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {profileStore} from "@/stores/index.js";
import {notifications} from "@mantine/notifications";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconPencil, IconPlus, IconTrash, IconCheck, IconCopy} from "@tabler/icons-react";
import {defaultConfigProfile} from "@/utils/defaultProfile.js";
import {DataTable} from "mantine-datatable";
import sharedStyles from "@/assets/shared.module.css";

const ProfileEditorRow = ({record, onValidate}) => {
  const [localValue, setLocalValue] = useState(JSON.stringify(record, null, 2));
  const [error, setError] = useState(null);

  return (
    <Box pos="relative">
      <Box pos="absolute" top={8} right={24} style={{zIndex: 1}}>
        <CopyButton value={localValue ?? ""}>
          {({copied, copy}) => (
            <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
              <ActionIcon
                size={18}
                variant="transparent"
                color={copied ? "teal" : "elv-gray.6"}
                onClick={copy}
              >
                {copied ? <IconCheck /> : <IconCopy />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Box>
      <JsonInput
        value={localValue}
        onChange={value => {
          setLocalValue(value);
          try {
            const parsed = JSON.parse(value);
            const customError = onValidate?.(parsed, record.slug);
            setError(customError || null);
            if(!customError) { profileStore.UpdateDraft(record.slug, value); }
          } catch {
            setError("Invalid JSON");
            onValidate?.(null, record.slug);
          }
        }}
        autosize
        minRows={5}
        maxRows={15}
        error={error}
        formatOnBlur
        styles={{input: {border: "none"}}}
      />
    </Box>
  );
};

const Settings = observer(() => {
  // Used to provide ConfirmModal with slug to be deleted
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    profileStore.LoadProfiles();
  }, []);

  const HandleRefresh = async() => {
    try {
      setRefreshing(true);
      await profileStore.LoadProfiles();
    } finally {
      setRefreshing(false);
    }
  };

  const HandleAddProfile = () => {
    const key = profileStore.AddDraft();
    setExpandedKeys(prev => [...prev, key]);
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
  if(profileStore.state === "error") { return <Text c="red" mt={12}>Failed to load config profiles. Check your connection and refresh.</Text>; }

  const draftEntries = Object.entries(profileStore.sortedDrafts);
  const newDrafts = draftEntries.filter(([key]) => !profileStore.profiles[key]);
  const existingDrafts = draftEntries.filter(([key]) => profileStore.profiles[key]);

  const records = [
    {...defaultConfigProfile, slug: "built-in", readonly: true, name: "Built-in Profile"},
    ...[...newDrafts].reverse().map(([slug, value]) => ({...value, slug})),
    ...existingDrafts.map(([slug, value]) => ({...value, slug}))
  ];

  return (
    <PageContainer
      title="Settings"
    >
      <Box w="100%" mb={20}>
        <Group>
          <SectionTitle>Config Profiles</SectionTitle>
          <Group ml="auto" gap={8}>
            <Button
              variant="filled"
              onClick={HandleAddProfile}
            >
              Add Profile
            </Button>
            {
              Object.keys(profileStore.drafts).length > 0 &&
              <Button
                variant="filled"
                onClick={HandleSave}
                disabled={saving || validationError}
                loading={saving}
              >
                Save
              </Button>
            }
            <Button
              variant="outline"
              onClick={HandleRefresh}
              disabled={refreshing}
            >
              Refresh
            </Button>
          </Group>
        </Group>
      </Box>
      <Box className={sharedStyles.tableWrapper}>
        <DataTable
          idAccessor="slug"
          highlightOnHover
          styles={{header: {color: "var(--mantine-color-elv-gray-9)"}}}
          records={records}
          fetching={refreshing}
          rowStyle={() => ({height: "50px"})}
          columns={[
            {
              accessor: "name",
              render: (record) => (
                <Text fz="0.875rem" fw={700} c="elv-gray.9">{ record.name }</Text>
              )
            },
            {
              accessor: "",
              textAlign: "right",
              render: (record) => record.readonly ? (
                <Group justify="flex-end">
                  <ActionIcon
                    size={20}
                    variant="transparent"
                    color="elv-neutral.4"
                    onClick={() => setExpandedKeys(prev =>
                      prev.includes(record.slug) ? prev.filter(k => k !== record.slug) : [record.slug]
                    )}
                  >
                    <IconPlus />
                  </ActionIcon>
                </Group>
              ) : (
                <Group justify="flex-end" gap={12}>
                  <Tooltip label="Edit" withArrow>
                    <ActionIcon
                      size={22}
                      variant="transparent"
                      color="elv-gray.6"
                      onClick={() => setExpandedKeys(prev =>
                        prev.includes(record.slug) ? prev.filter(k => k !== record.slug) : [record.slug]
                      )}
                    >
                      <IconPencil />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete" withArrow>
                    <ActionIcon
                      size={22}
                      variant="transparent"
                      color="elv-gray.6"
                      onClick={() => {
                        setPendingDeleteItem({slug: record.slug, name: record.name});
                        setShowModal(true);
                      }}
                    >
                      <IconTrash />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )
            }
          ]}
          rowExpansion={{
            allowMultiple: true,
            expanded: { recordIds: expandedKeys, onRecordIdsChange: setExpandedKeys },
            content: ({record}) => record.readonly ? (
              <Box pos="relative">
                <Box pos="absolute" top={8} right={20} style={{zIndex: 1}}>
                  <CopyButton value={JSON.stringify(defaultConfigProfile, null, 2)}>
                    {({copied, copy}) => (
                      <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                        <ActionIcon
                          size={18}
                          variant="transparent"
                          color={copied ? "teal" : "elv-gray.6"}
                          onClick={copy}
                        >
                          {copied ? <IconCheck /> : <IconCopy />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Box>
                <JsonInput
                  value={JSON.stringify(defaultConfigProfile, null, 2)}
                  readOnly
                  autosize
                  minRows={5}
                  maxRows={15}
                  styles={{input: {border: "none"}}}
                />
              </Box>
            ) : (
              <ProfileEditorRow
                record={record}
                onValidate={(parsed, slug) => {
                  if(!parsed) { setValidationError(true); return; }
                  let errorMessage;
                  if(!parsed.name) {
                    errorMessage = "A \"name\" field is required";
                    setValidationError(true);
                  }

                  const duplicate = Object.entries(profileStore.drafts)
                    .some(([dKey, d]) => d.name === parsed.name && dKey !== slug);

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
            )
          }}
        />
      </Box>
      <ConfirmModal
        title="Delete Profile Confirmation"
        message="Are you sure you want to delete the profile?"
        detailData={{
          nameKey: "Profile Name:",
          name: pendingDeleteItem?.name
        }}
        confirmText="Delete Profile"
        danger
        show={showModal}
        CloseCallback={() => setShowModal(false)}
        ConfirmCallback={async() => {
          await HandleDeleteProfile({slug: pendingDeleteItem.slug});
          profileStore.DeleteProfile(pendingDeleteItem?.slug);
          setPendingDeleteItem(null);
          setShowModal(false);
        }}
      />
    </PageContainer>
  );
});

export default Settings;
