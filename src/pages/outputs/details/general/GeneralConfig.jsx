import {observer} from "mobx-react-lite";
import {useEffect, useState} from "react";
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
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip
} from "@mantine/core";
import {IconArrowsShuffle, IconPlus, IconTrash} from "@tabler/icons-react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import SelectFailoverStreamModal from "@/pages/outputs/modals/SelectFailoverStreamModal.jsx";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import {dataStore, streamStore} from "@/stores/index.ts";
import {FABRIC_NODE_REGIONS, FAILOVER_TIMEOUT_OPTIONS, SOURCE_PACKAGING_COLOR_MAP} from "@/utils/constants.ts";
import {OutputUrlProtocol, SanitizeUrl} from "@/utils/helpers.ts";
import sharedStyles from "@/assets/shared.module.css";

const PackagingBadges = ({items}) => (
  <Group gap={4} wrap="nowrap">
    {
      (items || []).map(el => (
        <Badge
          key={el}
          radius={2}
          color={SOURCE_PACKAGING_COLOR_MAP[el]}
          c="elv-gray.7"
          tt="uppercase"
          fz={12}
          fw={400}
          classNames={{label: sharedStyles.badgeLabel}}
        >
          {el}
        </Badge>
      ))
    }
  </Group>
);

const FailoverStreamRow = ({record}) => (
  <Flex align="center" gap={16} px={12} py={12} mt={8} wrap="nowrap" bd="1px solid elv-gray.2">
    <Stack gap={3} style={{flex: "2 1 0", minWidth: 0}}>
      <Text fw={600} fz="0.875rem" c="elv-gray.9" lineClamp={1} style={{wordBreak: "break-all"}} lh={1}>
        {record.title || record.slug}
      </Text>
      <Text fz="0.75rem" c="elv-gray.6" lineClamp={1} lh={1}>{record.objectId}</Text>
    </Stack>
    <Text fz="0.875rem" c="elv-gray.9" lineClamp={1} lh={1} style={{flex: "1.5 1 0", minWidth: 0, wordBreak: "break-all"}}>
      {SanitizeUrl({url: record.originUrl})}
    </Text>
    <Box style={{flex: "1 1 0"}}><PackagingBadges items={record.source} /></Box>
    <Box style={{flex: "1 1 0"}}><PackagingBadges items={record.packaging} /></Box>
    {
      record.status &&
      <Box style={{flex: "1 1 0"}}>
        <StatusIndicator status={record.status} size="md" fw={400} />
      </Box>
    }
  </Flex>
);

// General Config tab for an output. Shares the "generalConfig" form (and dirty
// state) owned by OutputPanels with the Summary tab.
const GeneralConfig = observer(({form, output}) => {
  const [showFailoverModal, setShowFailoverModal] = useState(false);
  const {type, nodeType, failoverStream, failoverStreamName} = form.getValues();
  const isDedicated = nodeType === "dedicated";
  // srt_pull targets a source URL to pull from, not a destination the fabric pushes to,
  // so it has no editable Target URL.
  const isPush = type !== "srt_pull";
  const isSrt = type?.includes("srt");
  // Protocol-specific example shown in the Target URL field
  const urlPlaceholder = `${OutputUrlProtocol(type)}://example.com:1234`;
  // Failover needs something to fail away from - gated on a mapped primary.
  const hasPrimary = Boolean(output?.input?.stream);

  const ClearFailoverStream = () => {
    form.setFieldValue("failoverStream", "");
    form.setFieldValue("failoverStreamName", "");
  };

  // The failover row needs the full stream record (url / source / packaging) -
  // allStreams is the unscoped set the picker also uses.
  useEffect(() => {
    if(hasPrimary && failoverStream) { streamStore.LoadAllStreams(); }
  }, [hasPrimary, failoverStream]);

  const failoverRecord = failoverStream ?
    Object.values(streamStore.allStreams || {}).find(s => s.objectId === failoverStream) :
    undefined;

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

        <Divider mb={20} mt={30} />

        <SectionTitle mb={12}>Input Failover</SectionTitle>
        <DisabledTooltipWrapper
          disabled={!hasPrimary}
          tooltipLabel="A primary stream must be configured before setting input failover"
        >
          <Stack gap={20}>
            {
              failoverStream ?
                <Box>
                  <Group wrap="nowrap">
                    <Text fz={16} fw={600} lh={1.5} c="elv-black.3">Failover Stream</Text>
                    <Group ml="auto">
                      <Tooltip label="Change Failover Stream" position="bottom">
                        <ActionIcon
                          aria-label="Change failover stream"
                          variant="transparent"
                          c="elv-gray.6"
                          size={24}
                          disabled={!hasPrimary}
                          onClick={() => setShowFailoverModal(true)}
                        >
                          <IconArrowsShuffle size={24} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Remove Failover Stream" position="bottom">
                        <ActionIcon
                          aria-label="Remove failover stream"
                          variant="transparent"
                          c="elv-gray.6"
                          size={24}
                          disabled={!hasPrimary}
                          onClick={ClearFailoverStream}
                        >
                          <IconTrash size={24} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  {
                    failoverRecord ?
                      <FailoverStreamRow record={failoverRecord} /> :
                      <Text fz="0.875rem" c="dimmed" mt={8}>{failoverStreamName || failoverStream}</Text>
                  }
                </Box> :
                <Box>
                  <Input.Label>Failover Stream</Input.Label>
                  <Box mt={4}>
                    <Button
                      variant="outline"
                      leftSection={<IconPlus size={16} />}
                      disabled={!hasPrimary}
                      onClick={() => setShowFailoverModal(true)}
                    >
                      Add Failover Stream
                    </Button>
                  </Box>
                </Box>
            }
            <SimpleGrid cols={2} spacing={150}>
              <Select
                label="Failover Timeout"
                description="If the input feed is disconnected, the stream will remain active and wait for a reconnection for this duration."
                data={FAILOVER_TIMEOUT_OPTIONS}
                allowDeselect={false}
                disabled={!hasPrimary || !failoverStream}
                key={form.key("failoverAfter")}
                {...form.getInputProps("failoverAfter")}
              />
              <Select
                label="Reset Clients"
                description="All client sessions will be reset on failover."
                data={[{label: "On", value: "on"}, {label: "Off", value: "off"}]}
                allowDeselect={false}
                disabled={!hasPrimary || !failoverStream}
                key={form.key("failoverResetClients")}
                {...form.getInputProps("failoverResetClients")}
              />
            </SimpleGrid>
          </Stack>
        </DisabledTooltipWrapper>

        <SelectFailoverStreamModal
          show={showFailoverModal}
          onCloseModal={() => setShowFailoverModal(false)}
          currentStreamId={failoverStream}
          onSelect={record => {
            form.setFieldValue("failoverStream", record.objectId);
            form.setFieldValue("failoverStreamName", record.title);
          }}
        />
    </Box>
  );
});

export default GeneralConfig;
