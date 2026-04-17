import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {outputStore} from "@/stores/index.js";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Group,
  Input,
  Loader,
  Select,
  SimpleGrid,
  Tabs,
  TextInput,
  Tooltip
} from "@mantine/core";
import {Fragment, useEffect, useState} from "react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCopy} from "@tabler/icons-react";
import DetailCard, {DetailCardHeader} from "@/components/detail-card/DetailCard.jsx";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import {useClipboard, useDebouncedCallback} from "@mantine/hooks";
import {FABRIC_NODE_REGIONS, QUALITY_TEXT, STATUS_MAP} from "@/utils/constants.js";
import styles from "@/components/detail-card/DetailCard.module.css";
import {outputModalStore} from "@/stores/index.js";
import {DateFormat, BytesToMb} from "@/utils/helpers.js";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import {useForm} from "@mantine/form";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const SummaryPanel = observer(({output, id}) => {
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
              onClick={() => clipboard.copy(output.srt_pull?.urls?.[0])}
            >
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      <TextInput value={output.srt_pull?.urls?.[0]} readOnly />

      <Divider mb={20} mt={30} />

      <SectionTitle mb={12}>Fabric Geo</SectionTitle>
      <Select
        description="Defines the region."
        onChange={() => {}}
        data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
        value={output.description ?? ""}
        readOnly
      />

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
                {label: "Packets Sent / Drop (%)", value: `${client?.packets_sent?.toLocaleString()} / ${client?.packets_dropped?.toLocaleString()} (${(client.packets_dropped / client?.packets_sent).toFixed(2)}%)`},
                {label: "Bytes Sent / Drop (%)", value: `${BytesToMb(client.bytes_sent)} / ${BytesToMb(client.bytes_dropped)} (${(client.bytes_dropped / client.bytes_sent).toFixed(2)}%)`},
                {label: "Packets Sent / Retrans / Loss", value: `${client?.srt?.connection?.accumulated?.pkt_sent?.toLocaleString()} / ${client?.srt?.connection?.accumulated?.pkt_retrans?.toLocaleString()} / ${client?.srt?.connection?.accumulated?.pkt_send_loss?.toLocaleString()}`},
                {label: "SRT Connection Latency Recv / Send", value: `${client?.srt?.connection?.instantaneous?.ms_recv_tsb_pd_delay} / ${client?.srt?.connection?.instantaneous?.ms_send_tsb_pd_delay}`}
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

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      encryption: output?.srt_pull?.connection?.enforced_encryption,
      stripRtp: output?.srt_pull?.strip_rtp,
      passphrase: output?.srt_pull?.passphrase,
    }
  });

  const HandleSubmit = async(values) => {
    try {
      setApplyingChanges(true);

      const {encryption, stripRtp, passphrase} = values;

      await outputStore.ModifyOutput({
        outputId: id,
        encryption,
        stripRtp,
        passphrase: encryption ? passphrase : undefined
      });

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
            <TextInput
              label="Passphrase"
              type="password"
              key={form.key("passphrase")}
              {...form.getInputProps("passphrase")}
            />
          </SimpleGrid>
        }

        <Divider mb={20} mt={30} />

        <SectionTitle mb={12}>Fabric Geo</SectionTitle>
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
  const DebouncedRefresh = useDebouncedCallback(async() => {
    try {
      setLoading(true);
      await outputStore.LoadOutputs();
      if(output?.input?.stream) {
        await outputStore.LoadOutputStreamInfo({slug: id, streamObjectId: output.input.stream});
      }
    } finally {
      setLoading(false);
    }
  }, 500);

  useEffect(() => {
    if(outputStore.state !== "loaded") {
      outputStore.LoadOutputs()
        .then(() => {});
    }
  }, []);

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
      onClick: () => outputModalStore.OpenModal(output?.enabled ? "disable" : "enable", [id])
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
      title={output.name}
      subtitle={id}
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
                <SummaryPanel output={output} id={id} />
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
