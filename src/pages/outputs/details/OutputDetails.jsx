import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {outputStore} from "@/stores/index.js";
import {
  ActionIcon,
  Badge,
  Box, Button,
  Divider,
  Flex,
  Group,
  Loader,
  Select,
  Tabs,
  Text,
  TextInput,
  Tooltip
} from "@mantine/core";
import {useEffect} from "react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCopy} from "@tabler/icons-react";
import DetailCard, {DetailCardHeader} from "@/components/detail-card/DetailCard.jsx";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import {useClipboard} from "@mantine/hooks";
import {COLOR_MAP} from "@/utils/constants.js";
import styles from "@/components/detail-card/DetailCard.module.css";
import {outputModalStore} from "@/stores/index.js";

const SummaryPanel = observer(({output, id}) => {
  const clipboard = useClipboard();
  

  const inputDetails = [
    {label: "Name", value: <Text c="elv-gray.9" fw={600} fz="0.875rem">{ output?.input?.name }</Text>},
    {label: "Object ID", value: output.input?.stream, copyable: true},
    {label: "URL", value: output.input?.url, lineClamp: 1, copyable: true},
    {label: "Source", value: output?.input?.source?.map(el => <Badge key={`source-${el}`} radius={2} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400}>{el}</Badge>)},
    {label: "Packaging", value: output?.input?.packaging?.map(el => <Badge key={`packaging-${el}`} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12}>{el}</Badge>)},
  ];

  return (
    <Box pt={16}>
      <Flex direction="row" mb={36} gap={6}>
        {
          output?.input?.stream ?
          <DetailCard
            title="Input"
            titleRightSection={
              <StatusIndicator
                status={output?.input?.status}
                fw={400}
              />
            }
            details={inputDetails}
          /> :
            <Box w={380} bd="1px solid elv-gray.2" radius={5} className={styles.boxWrapper}>
              <Box p={12}>
                <DetailCardHeader title="Input" />
                <Box p="44px 100px">
                  <Button onClick={() => outputModalStore.OpenModal("map", [id])}>Map to a Stream</Button>
                </Box>
              </Box>
            </Box>
        }
        <DetailCard
          title="Output"
        />
        {/*<Box w={350}>*/}
        {/*  <VideoContainer*/}
        {/*    index={0}*/}
        {/*    slug={output?.input?.stream}*/}
        {/*    showPreview*/}
        {/*    playable={output?.input?.status === STATUS_MAP.RUNNING}*/}
        {/*    borderRadius={16}*/}
        {/*  />*/}
        {/*</Box>*/}
      </Flex>

      <SectionTitle mb={12}>
        <Group gap={8}>
          Embeddable URL
          <Tooltip
            label={clipboard.copied ? "Copied" : "Copy"}
            position="bottom"
          >
            <ActionIcon
              variant="transparent"
              c="elv-gray.6"
              size={18}
              onClick={() => clipboard.copy(output.input?.embedUrl)}
            >
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </SectionTitle>
      <TextInput value={output.input?.embedUrl} readOnly />

      <Divider mb={20} mt={30} />

      <SectionTitle mb={12}>Fabric Geo</SectionTitle>
      <Select
        label="Geo"
        withAsterisk
        onChange={() => {}}
        value={output.geos?.[0] ?? ""}
        readOnly
      />
    </Box>
  );
});

const GeneralConfigPanel = observer(() => {
  return (
    <Box pt={16}></Box>
  );
});

const OutputDetails = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();
  
  const output = outputStore.outputs[id];

  useEffect(() => {
    if(outputStore.state !== "loaded") {
      outputStore.LoadOutputs()
        .then(() => {});
    }
  }, []);

  useEffect(() => {
    if(output?.input?.stream) {
      outputStore.LoadOutputStreamInfo({slug: id, streamObjectId: output?.input?.stream})
        .then(() => {});
    }
  }, [output?.input?.stream]);

  if(!output) { return <Loader />; }

  const actions = [
    {
      label: "Back",
      buttonVariant: "filled",
      color: "elv-gray.6",
      onClick: () => navigate(-1)
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
      buttonVariant: "outline",
      onClick: () => outputModalStore.OpenModal("unmap", [id])
    }
  ];

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
        <Tabs.Panel value="summary">
          <SummaryPanel output={output} id={id} />
        </Tabs.Panel>
        <Tabs.Panel value="generalConfig">
          <GeneralConfigPanel />
        </Tabs.Panel>
      </Tabs>

    </PageContainer>
  );
});

export default OutputDetails;
