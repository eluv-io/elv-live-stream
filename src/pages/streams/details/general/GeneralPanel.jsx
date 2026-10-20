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
  TagsInput,
  Text,
  TextInput,
  Tooltip
} from "@mantine/core";
import {useEffect, useMemo, useRef, useState} from "react";
import {toJS} from "mobx";
import {useForm} from "@mantine/form";
import {tenantStore, settingsStore, streamEditStore, streamStatusStore, streamDetailStore, profileStore, streamSaveStore, streamListStore} from "@/stores/index.ts";
import {useParams} from "react-router-dom";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import {FABRIC_NODE_REGIONS, STATUS_MAP} from "@/utils/constants.ts";
import {StreamIsActive} from "@/utils/stream/stream.ts";
import {IconInfoCircle} from "@tabler/icons-react";

const GeneralPanel = observer(({slug, status, active, checkVersion, Refresh}) => {
  const currentConfigProfile = streamStatusStore.streams?.[slug].configProfile;
  const [applyingProfileChanges, setApplyingProfileChanges] = useState(false);
  const [currentSettings, setCurrentSettings] = useState({
    accessGroup: "",
    permission: ""
  });

  const [loading, setLoading] = useState(true);
  const [nodeType, setNodeType] = useState("public");
  const params = useParams();
  const loadedRef = useRef(null);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      description: "",
      displayTitle: "",
      accessGroup: "",
      permission: "",
      url: "",
      nodeType: "public",
      ingressNodeId: "",
      geo: "",
      tags: [],
      configProfile: currentConfigProfile || "",
      applyConfigProfile: false
    },
    validate: {
      name: (value) => (!value ? "Name is required" : null),
      url: (value) => (!value ? "URL is required" : null),
      ingressNodeId: (value, values) => (values.nodeType === "dedicated" && !value ? "Node is required" : null),
      configProfile: (value, values) => (
        !!value && value !== currentConfigProfile && !values.applyConfigProfile
          ? "Check \"Apply profile settings…\" to apply this profile"
          : null
      )
    },
    onValuesChange: (values) => {
      setNodeType(values.nodeType);
      streamSaveStore.SetDirty({id: "general", isDirty: form.isDirty()});
    }
  });

  useEffect(() => {
    const LoadData = async() => {
      try {
        setLoading(true);
        const libraryId = streamStatusStore.streams[slug]?.libraryId;
        await Promise.all([
          streamDetailStore.LoadGeneralConfigData({objectId: params.id, libraryId, slug}),
          settingsStore.loadedDedicatedNodes ? Promise.resolve() : settingsStore.LoadDedicatedNodes(),
          tenantStore.LoadAccessGroups(),
          profileStore.state !== "loaded" ? profileStore.LoadProfiles() : Promise.resolve()
        ]);
        const stream = streamStatusStore.streams[slug];

        const values = {
          name: stream.title || "",
          description: stream.description || "",
          displayTitle: stream.display_title || "",
          permission: stream.permission || "",
          accessGroup: stream.accessGroup || "",
          url: stream.originUrl || "",
          nodeType: !stream.geo && stream.ingressNodeId && settingsStore.dedicatedNodes?.[stream.ingressNodeId] ? "dedicated" : "public",
          ingressNodeId: stream.ingressNodeId || "",
          geo: stream.geo || "",
          tags: toJS(stream.tags) || [],
          configProfile: stream.configProfile || "",
          applyConfigProfile: false
        };

        // resetDirty before setValues: setValues fires onValuesChange
        // synchronously, and onValuesChange reads form.isDirty() against
        // whatever baseline resetDirty last set - doing it in this order
        // means that baseline already matches, so isDirty() reads false
        // instead of transiently true (which would mark this tab dirty
        // for no reason right after a fresh load or a post-save reload).
        form.resetDirty(values);
        form.setValues(values);

        setCurrentSettings({
          permission: stream.permission || "",
          accessGroup: stream.accessGroup || ""
        });
      } finally {
        setLoading(false);
      }
    };

    // Defer the load until this tab is first shown - all detail panels are
    // mounted at once (keepMountedMode="display-none"), so an unconditional
    // load here would fire every panel's fetches on page open.
    const loadKey = `${params.id}:${checkVersion}`;
    if(params.id && active && loadedRef.current !== loadKey) {
      loadedRef.current = loadKey;
      LoadData();
    }
  }, [params.id, active, checkVersion]);

  const Save = async() => {
    const {hasErrors} = form.validate();
    if(hasErrors) { throw new Error("Please resolve validation errors before saving"); }

    const values = form.getValues();

    await streamEditStore.SaveGeneralConfig({
      objectId: params.id,
      slug,
      formData: values,
      // Only re-apply the profile when it actually changed
      configProfile: values.configProfile !== currentConfigProfile ? values.configProfile : undefined,
      nodeChanged: ["nodeType", "ingressNodeId", "geo"].some(field => form.isDirty(field)),
      updatePermission: currentSettings.permission !== values.permission,
      updateAccessGroup: currentSettings.accessGroup !== values.accessGroup,
      removeAccessGroup: currentSettings.accessGroup
    });

    setCurrentSettings({permission: values.permission, accessGroup: values.accessGroup});
    form.resetDirty(values);
  };

  const SaveRef = useRef();
  SaveRef.current = Save;

  useEffect(() => {
    streamSaveStore.Register({
      id: "general",
      Save: () => SaveRef.current(),
      Discard: () => form.reset()
    });

    return () => streamSaveStore.Unregister("general");
  }, []);

  const profileOptions = useMemo(() => [
    {label: "Built-in Configuration", value: ""},
    ...Object.keys(profileStore.sortedProfiles).map(item => ({label: profileStore.profiles[item]?.name, value: item}))
  ], [profileStore.sortedProfiles, profileStore.profiles]);

  const accessGroupOptions = useMemo(() =>
    Object.keys(tenantStore.accessGroups || {}).map(name => ({
      label: name,
      value: tenantStore.accessGroups[name]?.address
    })),
    [tenantStore.accessGroups]
  );

  const permissionOptions = useMemo(() =>
    Object.keys(tenantStore.client.permissionLevels || {}).map(name => ({
      label: tenantStore.client.permissionLevels[name].short,
      value: name
    })),
    []
  );

  const permissionTooltipContent = useMemo(() =>
    Object.values(tenantStore.client.permissionLevels).map(({short, description}) =>
      <Flex key={`permission-info-${short}`} gap="1rem" lh={1.25} pb={5}>
        <Flex flex="0 0 25%">{short}:</Flex>
        <Text fz="sm">{description}</Text>
      </Flex>
    ),
    []
  );

  if(loading) { return <Loader />; }

  return (
    <>
      <Flex direction="column" style={{flexGrow: "1"}}>
        <SectionTitle mb={12}>General</SectionTitle>
        <Box mb="24px" maw="80%">
          <SimpleGrid cols={1} spacing={150} mb={18}>
            <DisabledTooltipWrapper
              disabled={StreamIsActive(status)}
              tooltipLabel="URL and node are only editable while the stream is inactive"
            >
              <Box>
              <Select
                label="Node Type"
                data={[
                  ...(settingsStore.dedicatedNodesList.length > 0 ? [{label: "Dedicated", value: "dedicated"}] : []),
                  {label: "Public", value: "public"}
                ]}
                key={form.key("nodeType")}
                {...form.getInputProps("nodeType")}
                mb={18}
                allowDeselect={false}
              />
              {
                nodeType === "dedicated" ?
                  <Select
                    label="Node"
                    placeholder="Select Node"
                    data={settingsStore.dedicatedNodesList}
                    key={form.key("ingressNodeId")}
                    {...form.getInputProps("ingressNodeId")}
                    mb={18}
                    allowDeselect={false}
                    withAsterisk
                  /> :
                  <Select
                    label="Fabric Geo"
                    description="Automatic lets the fabric choose a region"
                    data={[{value: "", label: "Automatic"}, ...FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))]}
                    key={form.key("geo")}
                    {...form.getInputProps("geo")}
                    mb={18}
                    allowDeselect={false}
                  />
              }
              <TextInput
                label="URL"
                placeholder="Enter a URL"
                required={true}
                key={form.key("url")}
                {...form.getInputProps("url")}
              />
              </Box>
            </DisabledTooltipWrapper>
          </SimpleGrid>
          <SimpleGrid cols={2} spacing={150} mb={18}>
            <TextInput
              label="Name"
              placeholder="Enter stream name"
              required={true}
              key={form.key("name")}
              {...form.getInputProps("name")}
            />
            <TextInput
              label="Display Title"
              placeholder="Enter a title"
              key={form.key("displayTitle")}
              {...form.getInputProps("displayTitle")}
            />
          </SimpleGrid>
          <TextInput
            label="Description"
            placeholder="Enter a description"
            description="Enter a description to provide more details and context."
            key={form.key("description")}
            {...form.getInputProps("description")}
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
                  data={profileOptions}
                  mb={12}
                  placeholder="Select Config Profile"
                  description={Object.keys(profileStore.sortedProfiles).length > 0 ? "Apply a predefined set of configuration settings to this stream." : "No profiles are configured. Create a profile in Settings."}
                  key={form.key("configProfile")}
                  {...form.getInputProps("configProfile")}
                  allowDeselect={false}
                />
              </SimpleGrid>
              <Checkbox
                label="Apply profile settings and overwrite current stream configuration"
                size="xs"
                key={form.key("applyConfigProfile")}
                {...form.getInputProps("applyConfigProfile", {type: "checkbox"})}
              />
              {
                (profileStore.profiles[currentConfigProfile]?.last_updated > streamStatusStore.streams[slug]?.profileLastUpdated) ?
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
                          Refresh?.();
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

          <TagsInput
            label="Tags"
            description="Add tags to organize and quickly find streams."
            placeholder="Type and press Enter to add a tag"
            data={streamListStore.TagOptions()}
            key={form.key("tags")}
            {...form.getInputProps("tags")}
            mb={29}
            clearable
          />

          <Divider mb={29} />

          <SectionTitle mb={12}>Access</SectionTitle>
          <SimpleGrid cols={2} spacing={150} mb={25}>
            <Select
              label="Access Group"
              description="Access Group responsible for managing your live stream object."
              data={accessGroupOptions}
              placeholder="Select Access Group"
              key={form.key("accessGroup")}
              {...form.getInputProps("accessGroup")}
            />
            <Select
              label={
                <Flex align="center" gap={6}>
                  Permission
                  <Tooltip
                    multiline
                    w={460}
                    label={permissionTooltipContent}
                  >
                    <Flex w={16}>
                      <IconInfoCircle color="var(--mantine-color-elv-gray-8)" />
                    </Flex>
                  </Tooltip>
                </Flex>
              }
              description="Stream permission level."
              placeholder="Select Permission"
              key={form.key("permission")}
              {...form.getInputProps("permission")}
              data={permissionOptions}
              allowDeselect={false}
            />
          </SimpleGrid>
        </Box>
      </Flex>
    </>
  );
});

export default GeneralPanel;
