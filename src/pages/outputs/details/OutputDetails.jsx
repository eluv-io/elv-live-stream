import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {useBlocker, useNavigate, useParams} from "react-router-dom";
import {dataStore, outputStore, outputSaveStore} from "@/stores/index.ts";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Group,
  Indicator,
  Input,
  Loader, PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import {Fragment, useCallback, useEffect, useRef, useState} from "react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCopy} from "@tabler/icons-react";
import DetailCard, {DetailCardHeader} from "@/components/detail-card/DetailCard.jsx";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import {useClipboard, useDebouncedCallback} from "@mantine/hooks";
import {FABRIC_NODE_REGIONS, OUTPUT_TYPE_COLOR_MAP, QUALITY_TEXT, STATUS_MAP} from "@/utils/constants.ts";
import styles from "@/components/detail-card/DetailCard.module.css";
import sharedStyles from "@/assets/shared.module.css";
import {outputModalStore} from "@/stores/index.ts";
import {DateFormat, BytesToMb} from "@/utils/formatters.ts";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import {useForm} from "@mantine/form";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";

const SummaryPanel = observer(({output, url, id, form}) => {
  const clipboard = useClipboard();
  const videoWidth = "355px";
  const videoGap = "20px";
  // client-js (OutputsList/OutputsListItem) marks this when the mapped stream's
  // content object is gone - e.g. deleted without unmapping this output.
  const streamUnavailable = output?.input?.status === STATUS_MAP.UNAVAILABLE;
  const {type} = form.getValues();
  // srt_pull has no editable Target URL - matches GeneralConfigPanel.
  const isPush = type !== "srt_pull";
  const urlPlaceholder = `${type === "srt_push" ? "srt" : type}://example.com:1234`;

  return (
    <Box pt={16}>
      <SectionTitle mb={12}>Key Stats</SectionTitle>
      <Flex direction="row" mb={36} gap={videoGap}>
        {
          output?.input?.stream && !streamUnavailable &&
          <Box w={videoWidth}>
            <VideoContainer
              index={0}
              id={output?.input?.stream}
              showPreview
              playable={output?.input?.status === STATUS_MAP.RUNNING}
              borderRadius={16}
            />
          </Box>
        }
        {
          streamUnavailable ?
            <Box style={{width: "100%"}} bd="1px solid elv-gray.2" radius={5} className={styles.boxWrapper}>
              <Box p={12}>
                <DetailCardHeader title="Input" />
                <Stack p="44px 100px" align="center" gap={12}>
                  <Text c="dimmed" ta="center">
                    The mapped stream no longer exists. Unmap it and select another stream.
                  </Text>
                  <Button onClick={() => outputModalStore.OpenModal("map", [id])}>Map to a Stream</Button>
                </Stack>
              </Box>
            </Box> :
          output?.input?.stream ?
          <DetailCard
            style={{width: `calc(100% - ${videoWidth} - ${videoGap})`}}
            title="Input"
            titleRightSection={
              <StatusIndicator
                status={output?.input?.status}
                fw={400}
              />
            }
            data={[
              {label: "Name", value: output?.input?.name},
              {label: "Quality", value: QUALITY_TEXT[output?.input?.quality]},
              {label: "Packets Recv / Drop (%)", value: output?.input?.stats?.ts ? `${output.input.stats.ts.packets_received?.toLocaleString()} / ${output.input.stats.ts.packets_dropped?.toLocaleString()} (${output.input.stats.ts.packets_received ? (output.input.stats.ts.packets_dropped / output.input.stats.ts.packets_received).toFixed(2) : "0.00"}%)` : ""},
              {label: "Seq Errors Number / Total Gap", value: output?.input?.stats?.rtp ? `${output.input.stats.rtp.seq_num_skip_tot?.toLocaleString()} / ${output.input.stats.rtp.seq_num_skip_count?.toLocaleString()}` : ""},
              {label: "Errors All / CC", value: `${([output?.input?.stats?.ts?.errors_cc, output?.input?.stats?.ts?.errors_incomplete_packets, output?.input?.stats?.ts?.errors_opening_output, output?.input?.stats?.ts?.errors_other, output?.input?.stats?.ts?.errors_writing].reduce((sum, val) => sum + (val ?? 0), 0))} / ${output?.input?.stats?.ts?.errors_cc ?? 0}`}
            ]}
          /> :
            <Box style={{width: "calc(100% - 355px - 20px)"}} bd="1px solid elv-gray.2" radius={5} className={styles.boxWrapper}>
              <Box p={12}>
                <DetailCardHeader title="Input" />
                <Box p="44px 100px" align="center">
                  <Button onClick={() => outputModalStore.OpenModal("map", [id])}>Map to a Stream</Button>
                </Box>
              </Box>
            </Box>
        }
      </Flex>

      <SectionTitle mb={12}>URLs</SectionTitle>
        <Group gap={8} mb={12}>
          <Input.Label>Output URL</Input.Label>
          <Tooltip
            label={clipboard.copied ? "Copied" : "Copy"}
            position="bottom"
          >
            <ActionIcon
              variant="transparent"
              c="elv-gray.6"
              size={16}
              onClick={() => clipboard.copy(url)}
            >
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      {
        isPush ?
          <TextInput
            placeholder={urlPlaceholder}
            withAsterisk
            key={form.key("url")}
            {...form.getInputProps("url")}
          /> :
          <TextInput value={url ?? ""} readOnly />
      }

      {
        output?.state?.clients?.map((client, i) => (
          <Fragment key={`output-client-${i}`}>
            <Divider mb={20} mt={30} />
            <SectionTitle mb={12}>Output - Client {i + 1}</SectionTitle>
            <DetailCard
              title="Output"
              data={[
                {label: "Client IP", value: client.client_ip},
                {label: "Connected at", value: client.connected_at ? DateFormat({time: client.connected_at, format: "iso"}) : null},
                {label: "Packets Sent / Drop (%)", value: `${client?.packets_sent?.toLocaleString()} / ${client?.packets_dropped?.toLocaleString()} (${client.packets_dropped ? (client.packets_dropped / client?.packets_sent).toFixed(2) : 0}%)`},
                {label: "Bytes Sent / Drop (%)", value: `${BytesToMb(client.bytes_sent)} / ${BytesToMb(client.bytes_dropped)} (${client.bytes_dropped ? (client.bytes_dropped / client.bytes_sent).toFixed(2) : 0}%)`},
                {label: "Packets Sent / Retrans / Loss", value: client?.srt?.connection ? `${client?.srt?.connection?.accumulated?.pkt_sent?.toLocaleString()} / ${client?.srt?.connection?.accumulated?.pkt_retrans?.toLocaleString()} / ${client?.srt?.connection?.accumulated?.pkt_send_loss?.toLocaleString()}` : ""},
                {label: "SRT Connection Latency Recv / Send", value: client?.srt?.connection ? `${client?.srt?.connection?.instantaneous?.ms_recv_tsb_pd_delay} / ${client?.srt?.connection?.instantaneous?.ms_send_tsb_pd_delay}` : ""}
              ]}
            />
          </Fragment>
        ))
      }
    </Box>
  );
});

const GeneralConfigPanel = observer(({form}) => {
  const {type, nodeType} = form.getValues();
  const isDedicated = nodeType === "dedicated";
  // srt_pull targets a source URL to pull from, not a destination the fabric pushes to,
  // so it has no editable Target URL.
  const isPush = type !== "srt_pull";
  const isSrt = type?.includes("srt");
  // Protocol-specific example shown in the Target URL field
  const urlPlaceholder = `${type === "srt_push" ? "srt" : type}://example.com:1234`;

  return (
    <Box pt={16}>
      <SectionTitle mb={12}>General</SectionTitle>
      <Box mb={20}>
        <TextInput
          label="Name"
          key={form.key("name")}
          {...form.getInputProps("name")}
        />
      </Box>
        {/*<SimpleGrid cols={2} spacing={150}>*/}
        {/*  <TagsInput*/}
        {/*    label="Tags"*/}
        {/*    description="Add tags to organize and quickly find outputs."*/}
        {/*    placeholder="Type and press Enter to add a tag"*/}
        {/*    data={outputStore.allOutputTags.filter(t => !(form.getValues().tags || []).includes(t))}*/}
        {/*    key={form.key("tags")}*/}
        {/*    {...form.getInputProps("tags")}*/}
        {/*    clearable*/}
        {/*  />*/}
        {/*</SimpleGrid>*/}

        <Divider mb={20} mt={30} />

        <Box>
          <SectionTitle mb={12}>Output</SectionTitle>
          <Select
            label="Output Type"
            description="Defines the output type"
            placeholder="Output Type"
            allowDeselect={false}
            data={[
              {label: "SRT PULL", value: "srt_pull"},
              {label: "SRT PUSH", value: "srt_push"},
              {label: "RTP", value: "rtp"},
              {label: "UDP", value: "udp"}
            ]}
            key={form.key("type")}
            {...form.getInputProps("type")}
            onChange={(value) => {
              form.setFieldValue("type", value);
              form.setFieldValue("url", "");
            }}
            mb={20}
          />
          <Stack gap={20}>
            <Select
              label="Node Type"
              data={[
                ...(dataStore.dedicatedNodesList.length > 0 ? [{label: "Dedicated", value: "dedicated"}] : []),
                {label: "Public", value: "public"}
              ]}
              allowDeselect={false}
              key={form.key("nodeType")}
              {...form.getInputProps("nodeType")}
              onChange={(value) => {
                form.setFieldValue("nodeType", value);
                form.setFieldValue("url", "");
              }}
            />
            {
              isDedicated ?
                <Select
                  label="Node"
                  placeholder={dataStore.loadedDedicatedNodes ? "Select Node" : "Loading Nodes..."}
                  data={dataStore.dedicatedNodesList}
                  allowDeselect={false}
                  withAsterisk
                  key={form.key("node")}
                  {...form.getInputProps("node")}
                /> :
                <Select
                  label="Fabric Geo"
                  withAsterisk
                  data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
                  placeholder="Select Geo"
                  clearable
                  key={form.key("geo")}
                  {...form.getInputProps("geo")}
                />
            }
            {
              isPush &&
              <TextInput
                label="Target URL"
                placeholder={urlPlaceholder}
                key={form.key("url")}
                withAsterisk
                {...form.getInputProps("url")}
              />
            }
          </Stack>
        </Box>

        {
          isSrt &&
          <>
            <Divider mb={20} mt={30} />

            <SectionTitle mb={12}>Encryption</SectionTitle>
            <Checkbox
              label="Enable Encryption"
              description="If encryption is enabled, a passphrase is required to decrypt the stream. If not provided, one will be auto-generated."
              key={form.key("encryption")}
              {...form.getInputProps("encryption", {type: "checkbox"})}
            />
            {
              form.getValues().encryption &&
              <SimpleGrid cols={2} spacing={150} mt={20} pl={28}>
                <PasswordInput
                  label="Passphrase"
                  key={form.key("passphrase")}
                  {...form.getInputProps("passphrase")}
                />
              </SimpleGrid>
            }

            <Divider mb={20} mt={30} />

            <SectionTitle mb={12}>Strip RTP</SectionTitle>
            <Checkbox
              label="Enable Strip RTP"
              description="Remove RTP encapsulation from the incoming stream"
              key={form.key("stripRtp")}
              {...form.getInputProps("stripRtp", {type: "checkbox"})}
            />
          </>
        }
    </Box>
  );
});

// Owns the form shared by SummaryPanel and GeneralConfigPanel, so edits from
// either tab share the "generalConfig" dirty state. Mounted only once output
// data has loaded, so initialValues below are always real.
const OutputPanels = observer(({output, id, url}) => {
  const initialType = output?.srt_pull ? "srt_pull" : output?.srt_push ? "srt_push" : output?.udp ? "udp" : "rtp";
  const initialHasDedicatedNode = output.description?.startsWith("inod");
  const initialTargetUrl = output?.srt_pull?.urls?.[0] ?? output?.srt_push?.url ?? output?.rtp?.url ?? output?.udp?.url;

  useEffect(() => {
    if(!dataStore.loadedDedicatedNodes) { dataStore.LoadDedicatedNodes(); }
  }, []);

  const form = useForm({
    mode: "controlled",
    initialValues: {
      name: output?.name,
      type: initialType, // rtp | srt_pull | srt_push | udp
      nodeType: initialHasDedicatedNode ? "dedicated" : "public", // dedicated | public
      node: initialHasDedicatedNode ? (output.description ?? "") : "",
      geo: !initialHasDedicatedNode ? (output.description ?? "") : "",
      url: initialTargetUrl ?? "",
      encryption: output?.[initialType]?.connection?.enforced_encryption,
      stripRtp: output?.[initialType]?.strip_rtp,
      passphrase: output?.[initialType]?.passphrase
      // tags: output?.tags || []
    },
    validate: {
      passphrase: (value, values) => {
        if(!values.encryption) { return null; }
        if(value && (value.length < 10 || value.length > 79)) {
          return "Passphrase must be between 10 and 79 characters long";
        }
        return null;
      },
      node: (value, values) => values.nodeType === "dedicated" ? (value ? null : "Node is required") : null,
      geo: (value, values) => values.nodeType === "public" ? (value ? null : "Geo is required") : null,
      url: (value, values) => values.type === "srt_pull" ? null : (value ? null : "URL is required")
    },
    onValuesChange: () => {
      outputSaveStore.SetDirty({id: "generalConfig", isDirty: form.isDirty()});
      // Summary only ever edits "url" - track it separately so changes to
      // General-Config-only fields (e.g. name) don't flag Summary as dirty.
      outputSaveStore.SetUrlDirty(form.isDirty("url"));
    }
  });

  const Save = async() => {
    const {hasErrors} = form.validate();
    if(hasErrors) { throw new Error("Please resolve validation errors before saving"); }

    const values = form.getValues();
    const {name, type, node, geo, encryption, stripRtp, passphrase, url} = values;
    const isDedicated = values.nodeType === "dedicated";
    const isPush = type !== "srt_pull";

    await outputStore.ModifyOutput({
      outputId: id,
      name,
      type,
      encryption,
      stripRtp,
      passphrase: encryption ? passphrase : undefined,
      // "" rather than undefined for the inactive one of node/region - ModifyOutput
      // treats undefined as "leave existing value alone", but switching between
      // dedicated node and public geo must clear whichever one is no longer active,
      // or the fabric rejects the update ("only one of elvgeos or node_ids can be set").
      node: isDedicated ? node : "",
      region: !isDedicated ? geo : "",
      url: isPush ? url : undefined,
      // tags
    });

    // resetDirty before setFieldValue: same reasoning as GeneralPanel - set
    // the baseline to include the (possibly server-assigned) passphrase
    // first, so setting the field to match it doesn't read as a new change.
    const newPassphrase = outputStore.outputs[id]?.[type]?.passphrase ?? "";
    form.resetDirty({...values, passphrase: newPassphrase});
    form.setFieldValue("passphrase", newPassphrase);
  };

  const SaveRef = useRef();
  SaveRef.current = Save;

  useEffect(() => {
    outputSaveStore.Register({
      id: "generalConfig",
      Save: () => SaveRef.current(),
      Discard: () => form.reset()
    });

    return () => outputSaveStore.Unregister("generalConfig");
  }, []);

  return (
    <>
      <Tabs.Panel value="summary">
        <SummaryPanel output={output} url={url} id={id} form={form} />
      </Tabs.Panel>
      <Tabs.Panel value="generalConfig">
        <GeneralConfigPanel form={form} />
      </Tabs.Panel>
    </>
  );
});

// Both tabs share the "generalConfig" save/discard action (see OutputPanels),
// but each shows its own dirty indicator: Summary only edits "url", so it
// uses the field-level urlDirty flag rather than the whole-form flag.
const OUTPUT_TABS = [
  {label: "Summary", value: "summary", savable: true, IsDirty: () => outputSaveStore.urlDirty},
  {label: "General Config", value: "generalConfig", savable: true, IsDirty: () => outputSaveStore.IsDirty("generalConfig")}
];

const OutputDetails = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [pendingBack, setPendingBack] = useState(false);

  // Blocks in-app navigation (sidebar links, browser back/forward, navigate())
  // away from this page while the config tab has unsaved changes. Only
  // guards actual route changes - switching within-page tabs doesn't change
  // the pathname, so it's left alone. Mirrors StreamDetailsPage.
  const blocker = useBlocker(
    useCallback(
      ({currentLocation, nextLocation}) =>
        outputSaveStore.anyDirty && currentLocation.pathname !== nextLocation.pathname,
      []
    )
  );

  // Reset during render, not an effect: an effect here would run after (and
  // wipe out) OutputPanels' own registration effect. Mirrors StreamDetailsPage.
  const resetOutputIdRef = useRef(null);
  if(id && resetOutputIdRef.current !== id) {
    resetOutputIdRef.current = id;
    outputSaveStore.Reset();
  }

  const output = outputStore.outputs[id];
  const flatOutput = outputStore.OutputItem(id);
  const url = flatOutput?.url;
  // "inod" is the Eluvio fabric's node-ID prefix (see elv-client-js's
  // Utils.AddressToNodeId) - a dedicated node ID is stashed in description.
  const hasDedicatedNode = output?.description?.startsWith("inod");
  const geoLabel = !hasDedicatedNode ?
    FABRIC_NODE_REGIONS.find(geo => geo.value === output?.description)?.label :
    undefined;
  const nodeLabel = hasDedicatedNode ?
    dataStore.dedicatedNodes?.[output.description]?.name :
    undefined;
  const typeBadges = flatOutput?.type?.length ?
    <Group gap={4} wrap="nowrap">
      {
        flatOutput.type.map(type => (
          <Badge key={type} radius={2} color={OUTPUT_TYPE_COLOR_MAP[type]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>
            {type}
          </Badge>
        ))
      }
    </Group> :
    undefined;
  const subtitleItems = [
    typeBadges,
    geoLabel,
    hasDedicatedNode ? "Dedicated" : "Public",
    nodeLabel
  ].filter(Boolean);
  const DebouncedRefresh = useDebouncedCallback(async() => {
    try {
      setLoading(true);
      await outputStore.LoadOutputItem({outputId: id});
      if(output?.input?.stream && output?.input?.status !== STATUS_MAP.UNAVAILABLE) {
        await outputStore.LoadOutputStreamInfo({slug: id, streamObjectId: output.input.stream});
      }
    } finally {
      setLoading(false);
    }
  }, 500);

  useEffect(() => {
    if(id) {
      outputStore.LoadOutputItem({outputId: id})
        .then(() => {});
    }
  }, [id]);

  useEffect(() => {
    // OutputsList/OutputsListItem (client-js) already mark input.status
    // "unavailable" when the mapped stream's content object is gone (e.g.
    // deleted without unmapping this output) - skip the doomed enrichment
    // call rather than repeating the same failure it already caught.
    if(!output?.input?.stream || output?.input?.status === STATUS_MAP.UNAVAILABLE) { return; }

    const LoadData = async() => {
      try {
        setLoading(true);
        await outputStore.LoadOutputStreamInfo({slug: id, streamObjectId: output?.input?.stream})
          .then(() => {});
      } finally {
        setLoading(false);
      }
    };

    LoadData();
  }, [output?.input?.stream, output?.input?.status]);

  const HandleSaveAll = async () => {
    try {
      await outputSaveStore.SaveAll();

      notifications.show({
        title: <NotificationMessage>Updated {output?.name || id}</NotificationMessage>,
        message: "Changes have been applied successfully"
      });

      DebouncedRefresh();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save changes", error);

      const failedTab = OUTPUT_TABS.find(tab => tab.value === outputSaveStore.failedPanelId);

      notifications.show({
        title: "Error",
        color: "red",
        message: `Unable to save ${failedTab?.label ?? "changes"}. Please review that tab and try again.`
      });
    }
  };

  const HandleDiscardAll = () => {
    outputSaveStore.DiscardAll();
  };

  // Checks dirty state before ever calling navigate(-1) - see StreamDetailsPage
  // for why this is pre-checked rather than left to the router blocker alone.
  const HandleBack = () => {
    if(outputSaveStore.anyDirty) {
      setPendingBack(true);
    } else {
      navigate(-1);
    }
  };

  const actions = [
    {
      label: "Back",
      buttonVariant: "filled",
      color: "elv-gray.6",
      onClick: HandleBack
    },
    {
      label: "Refresh",
      buttonVariant: "outline",
      onClick: DebouncedRefresh
    },
    {
      label: "Reset",
      buttonVariant: "outline",
      onClick: () => outputModalStore.OpenModal("reset", [id]),
      mutatesOutput: true
    },
    {
      label: output?.enabled ? "Disable" : "Enable",
      buttonVariant: "outline",
      onClick: () => outputModalStore.OpenModal(output?.enabled ? "disable" : "enable", [id], () => outputStore.LoadOutputItem({outputId: id})),
      mutatesOutput: true
    },
    {
      label: "Unmap Stream",
      buttonVariant: "filled",
      onClick: () => outputModalStore.OpenModal("unmap", [id]),
      hidden: !output?.input?.stream,
      mutatesOutput: true
    },
    {
      label: "Map to a Stream",
      buttonVariant: "filled",
      onClick: () => outputModalStore.OpenModal("map", [id]),
      hidden: output?.input?.stream,
      mutatesOutput: true
    }
  ]
    .filter(e => !e.hidden)
    .map(action =>
      action.mutatesOutput && outputSaveStore.anyDirty ?
        {...action, disabled: true, disabledTooltip: "Save or discard your changes to use output controls"} :
        action
    );

  if(!output) { return <Loader />; }

  return (
    <PageContainer
      title={outputStore?.outputs?.[id]?.name ?? ""}
      subtitle={id}
      subtitleRightSection={
        subtitleItems.length > 0 &&
        <Group gap={8}>
          {
            subtitleItems.map((item, i) => (
              <Group gap={8} key={i} wrap="nowrap">
                <Title order={6} c="elv-gray.6" mt={0}>•</Title>
                {
                  typeof item === "string" ?
                    <Title order={6} c="elv-gray.6" mt={0}>{item}</Title> :
                    item
                }
              </Group>
            ))
          }
        </Group>
      }
      actions={actions}
      titleRightSection={
        <LabeledIndicator
          label={output?.enabled ? "Enabled" : "Disabled"}
          color={output?.enabled ? "elv-green.5" : "elv-red.4"}
          size="md"
          withBorder
        />
      }
    >
      {/* keepMountedMode="display-none": avoids Mantine's default Activity-based
          unmount on tab switch, which would wipe OutputPanels' outputSaveStore
          registration. Mirrors StreamDetailsPage. */}
      <Tabs defaultValue="summary" keepMountedMode="display-none">
        <Flex justify="space-between" align="center" mb={22}>
          <Tabs.List>
            {
              OUTPUT_TABS.map(tab => (
                <Tabs.Tab value={tab.value} key={`output-details-tab-${tab.value}`}>
                  <Indicator
                    disabled={!(tab.savable && tab.IsDirty())}
                    color="elv-blue.3"
                    size={8}
                    offset={-4}
                    position="top-end"
                  >
                    <Title order={3} c="elv-gray.9">{tab.label}</Title>
                  </Indicator>
                </Tabs.Tab>
              ))
            }
          </Tabs.List>
          <Flex gap={12} align="center">
            <Button
              variant="outline"
              color="elv-gray.6"
              disabled={!outputSaveStore.anyDirty || outputSaveStore.saving}
              onClick={() => setShowDiscardModal(true)}
            >
              Discard Changes
            </Button>
            <Button
              disabled={!outputSaveStore.anyDirty}
              loading={outputSaveStore.saving}
              onClick={HandleSaveAll}
            >
              Save
            </Button>
          </Flex>
        </Flex>
        {
          (loading || outputStore.state !== "loaded") ?
            <Box p={15}><Loader /></Box> :
            <OutputPanels output={output} id={id} url={url} />
        }
      </Tabs>

      <ConfirmModal
        show={showDiscardModal}
        title="Discard Changes"
        message="Are you sure you want to discard your unsaved changes? This cannot be undone."
        confirmText="Discard Changes"
        cancelText="Cancel"
        ConfirmCallback={async () => HandleDiscardAll()}
        CloseCallback={() => setShowDiscardModal(false)}
      />

      <ConfirmModal
        show={blocker.state === "blocked" || pendingBack}
        title="Unsaved Changes"
        message="Are you sure you want to leave this page? Your unsaved changes will be lost."
        confirmText="Leave Without Saving"
        cancelText="Cancel"
        ConfirmCallback={async () => {
          outputSaveStore.DiscardAll();

          if(pendingBack) {
            setPendingBack(false);
            navigate(-1);
          } else {
            blocker.proceed();
          }
        }}
        CloseCallback={() => {
          setPendingBack(false);

          if(blocker.state === "blocked") {
            blocker.reset();
          }
        }}
      />
    </PageContainer>
  );
});

export default OutputDetails;
