import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {dataStore, outputStore} from "@/stores/index.ts";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Group,
  Input,
  Loader, PasswordInput,
  Select,
  SimpleGrid,
  Tabs,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import {Fragment, useEffect, useState} from "react";
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

const SummaryPanel = observer(({output, url, id}) => {
  const clipboard = useClipboard();
  const videoWidth = "355px";
  const videoGap = "20px";

  return (
    <Box pt={16}>
      <SectionTitle mb={12}>Key Stats</SectionTitle>
      <Flex direction="row" mb={36} gap={videoGap}>
        {
          output?.input?.stream &&
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
      <TextInput value={url ?? ""} readOnly />

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

const GeneralConfigPanel = observer(({output, id}) => {
  const [applyingChanges, setApplyingChanges] = useState(false);

  const outputType = output?.srt_pull ? "srt_pull" : output?.srt_push ? "srt_push" : output?.udp ? "udp" : "rtp";
  const [encryptionEnabled, setEncryptionEnabled] = useState(!!output?.[outputType]?.connection?.enforced_encryption);
  const hasDedicatedNode = output.description?.startsWith("inod");
  // srt_pull targets a source URL to pull from, not a destination the fabric pushes to,
  // so it has no editable Target URL.
  const isPush = outputType !== "srt_pull";
  const targetUrl = output?.srt_pull?.urls?.[0] ?? output?.srt_push?.url ?? output?.rtp?.url ?? output?.udp?.url;

  useEffect(() => {
    if(!dataStore.loadedDedicatedNodes) { dataStore.LoadDedicatedNodes(); }
  }, []);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      encryption: output?.[outputType]?.connection?.enforced_encryption,
      stripRtp: output?.[outputType]?.strip_rtp,
      passphrase: output?.[outputType]?.passphrase,
      name: output?.name,
      node: hasDedicatedNode ? (output.description ?? "") : "",
      geo: !hasDedicatedNode ? (output.description ?? "") : "",
      url: targetUrl ?? ""
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
      node: (value) => hasDedicatedNode ? (value ? null : "Node is required") : null,
      geo: (value) => !hasDedicatedNode ? (value ? null : "Geo is required") : null,
      url: (value) => isPush ? (value ? null : "URL is required") : null
    }
  });

  // "uncontrolled" form mode doesn't re-render the panel when a field changes,
  // so the Passphrase field's visibility needs its own subscription to stay in sync.
  form.watch("encryption", ({value}) => setEncryptionEnabled(!!value));

  const HandleSubmit = async(values) => {
    try {
      setApplyingChanges(true);

      const {encryption, stripRtp, passphrase, name, node, geo, url} = values;

      await outputStore.ModifyOutput({
        outputId: id,
        encryption,
        stripRtp,
        passphrase: encryption ? passphrase : undefined,
        name,
        node: hasDedicatedNode ? node : undefined,
        region: !hasDedicatedNode ? geo : undefined,
        url: isPush ? url : undefined,
        // tags
      });

      form.setFieldValue("passphrase", outputStore.outputs[id]?.[outputType]?.passphrase ?? "");

      notifications.show({
        title: <NotificationMessage>Updated output</NotificationMessage>,
        message: "Changes have been applied successfully"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update output", error);

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
    <Box pt={16}>
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <SectionTitle mb={12}>General</SectionTitle>
        <SimpleGrid cols={2} spacing={150} mb={20}>
          <TextInput
            label="Name"
            key={form.key("name")}
            {...form.getInputProps("name")}
          />
        </SimpleGrid>
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
          <Box style={{opacity: 0.5, pointerEvents: "none"}} mb={20}>
            <Select
              label="Node Type"
              onChange={() => {}}
              data={[
                {label: "Dedicated", value: "dedicated"},
                {label: "Public", value: "public"}
              ]}
              value={hasDedicatedNode ? "dedicated" : "public"}
              readOnly
            />
          </Box>
          {
            hasDedicatedNode &&
            <Select
              label="Node"
              placeholder={dataStore.loadedDedicatedNodes ? "Select Node" : "Loading Nodes..."}
              data={dataStore.dedicatedNodesList}
              mb={20}
              key={form.key("node")}
              {...form.getInputProps("node")}
            />
          }
          {
            isPush &&
            <TextInput
              label="Target URL"
              key={form.key("url")}
              {...form.getInputProps("url")}
            />
          }
        </Box>

        {
          !hasDedicatedNode &&
          <>
            <Divider mb={20} mt={30} />

            <Box>
              <SectionTitle mb={12}>Fabric Geo</SectionTitle>
              <Select
                description="The geographic region this output is served from."
                data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
                key={form.key("geo")}
                {...form.getInputProps("geo")}
              />
            </Box>
          </>
        }

        <Divider mb={20} mt={30} />

        <SectionTitle mb={12}>Encryption</SectionTitle>
        <Checkbox
          label="Enable Encryption"
          description="If encryption is enabled, a passphrase is required to decrypt the stream. If not provided, one will be auto-generated."
          key={form.key("encryption")}
          {...form.getInputProps("encryption", {type: "checkbox"})}
        />
        {
          encryptionEnabled &&
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

        <Button
          mt={60}
          type="submit"
          disabled={applyingChanges || !form.isDirty()}
          loading={applyingChanges}
        >
          Save
        </Button>
      </form>
    </Box>
  );
});

const OutputDetails = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const output = outputStore.outputs[id];
  const flatOutput = outputStore.OutputItem(id);
  const url = flatOutput?.url;
  // "inod" is the Eluvio fabric's node-ID prefix (see elv-client-js's
  // Utils.AddressToNodeId) - a dedicated node ID is stashed in description.
  const hasDedicatedNode = output?.description?.startsWith("inod");
  const geoLabel = !hasDedicatedNode ?
    FABRIC_NODE_REGIONS.find(geo => geo.value === output?.description)?.label :
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
    hasDedicatedNode ? "Dedicated" : "Public"
  ].filter(Boolean);
  const DebouncedRefresh = useDebouncedCallback(async() => {
    try {
      setLoading(true);
      await outputStore.LoadOutputItem({outputId: id});
      if(output?.input?.stream) {
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
    if(!output?.input?.stream) { return; }

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
  }, [output?.input?.stream]);

  const actions = [
    {
      label: "Back",
      buttonVariant: "filled",
      color: "elv-gray.6",
      onClick: () => navigate(-1)
    },
    {
      label: "Refresh",
      buttonVariant: "outline",
      onClick: DebouncedRefresh
    },
    {
      label: "Reset",
      buttonVariant: "outline",
      onClick: () => outputModalStore.OpenModal("reset", [id])
    },
    {
      label: output?.enabled ? "Disable" : "Enable",
      buttonVariant: "outline",
      onClick: () => outputModalStore.OpenModal(output?.enabled ? "disable" : "enable", [id], () => outputStore.LoadOutputItem({outputId: id}))
    },
    {
      label: "Unmap Stream",
      buttonVariant: "filled",
      onClick: () => outputModalStore.OpenModal("unmap", [id]),
      hidden: !output?.input?.stream
    },
    {
      label: "Map to a Stream",
      buttonVariant: "filled",
      onClick: () => outputModalStore.OpenModal("map", [id]),
      hidden: output?.input?.stream
    }
  ]
    .filter(e => !e.hidden);

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
      <Tabs defaultValue="summary">
        <Tabs.List>
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
          <Tabs.Tab value="generalConfig">General Config</Tabs.Tab>
        </Tabs.List>
        {
          (loading || outputStore.state !== "loaded") ?
            <Box p={15}><Loader /></Box> :
            <>
              <Tabs.Panel value="summary">
                <SummaryPanel output={output} url={url} id={id} />
              </Tabs.Panel>
              <Tabs.Panel value="generalConfig">
                <GeneralConfigPanel output={output} id={id} />
              </Tabs.Panel>
            </>
        }
      </Tabs>

    </PageContainer>
  );
});

export default OutputDetails;
