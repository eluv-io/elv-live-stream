import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {outputStore} from "@/stores/index.js";
import {ActionIcon, Badge, Divider, Flex, Group, Loader, Select, Text, TextInput, Tooltip} from "@mantine/core";
import {useEffect} from "react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCopy} from "@tabler/icons-react";
import DetailCard from "@/components/detail-card/DetailCard.jsx";
import StatusText from "@/components/status-text/StatusText.jsx";
import {useClipboard} from "@mantine/hooks";
import {COLOR_MAP, STATUS_TEXT} from "@/utils/constants.js";

const OutputDetails = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();
  const clipboard = useClipboard();
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
    },
    {
      label: "Disable",
      buttonVariant: "outline",
    },
    {
      label: "Unmap Stream",
      buttonVariant: "outline",
    }
  ];

  const inputDetails = [
    {label: "Name", value: <Text c="elv-gray.9" fw={600} fz="0.875rem">{ output?.input?.name }</Text>},
    {label: "Object ID", value: output.input?.stream, copyable: true},
    {label: "URL", value: output.input?.url, lineClamp: 1, copyable: true},
    {label: "Source", value: output?.input?.source?.map(el => <Badge key={`source-${el}`} radius={2} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400}>{el}</Badge>)},
    {label: "Packaging", value: output?.input?.packaging?.map(el => <Badge key={`packaging-${el}`} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12}>{el}</Badge>)},
  ];

  return (
    <PageContainer
      title={output.name}
      subtitle={id}
      actions={actions}
      titleRightSection={
        <StatusText
          label="Enabled"
          // quality={streamBrowseStore.streams?.[streamSlug]?.quality}
          size="md"
          withBorder
        />
      }
    >
      <Flex direction="row" mb={36} gap={6}>
        <DetailCard
          title="Input"
          titleRightSection={<StatusText label={STATUS_TEXT[output?.input?.status]} fw={400} />}
          details={inputDetails}
        />
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

    </PageContainer>
  );
});

export default OutputDetails;
