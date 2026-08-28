import {useState} from "react";
import {
  ActionIcon,
  Badge,
  Box,
  CopyButton,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Tooltip,
  UnstyledButton
} from "@mantine/core";
import {IconCheck, IconChevronRight, IconCopy} from "@tabler/icons-react";
import {SOURCE_PACKAGING_COLOR_MAP} from "@/utils/constants.ts";
import sharedStyles from "@/assets/shared.module.css";

const SUBROW_BG = "#F5F5F5";
const SELECTED_COLOR = "#4489df";

const URL_MODES = [
  {label: "Authorized", value: "authorized"},
  {label: "Public", value: "public"}
];

const PACKAGING_OPTIONS = [
  {label: "FMP4", value: "fmp4"},
  {label: "TS", value: "ts"}
];

// HLS playout URLs point at a "playlist" manifest whose segment packaging (fMP4/TS) is
// selected by renaming it "playlist-{type}" - the same convention client-js's own
// PlayoutOptions playoutType param uses. DASH manifests have no "playlist" segment, so the
// replace is a no-op there.
const ApplyPackaging = (url, packaging) => url ? url.replace("playlist", `playlist-${packaging}`) : url;

// Flattens one stream's output URLs into rows. A DRM method (e.g. Widevine) becomes a
// parent row with a blank URL plus two sub-rows: the playout URL and the license server URL.
// mode picks between the channel-auth URL (default) and its named-network, anonymous-token
// public counterpart; packaging picks the HLS segment format (fMP4/TS).
const UrlRows = (output, mode, packaging) => {
  if(!output) { return []; }
  const isPublic = mode === "public";

  const rows = [];
  if(output.embedUrl) { rows.push({label: "Embeddable URL", url: output.embedUrl}); }

  const playoutUrl = isPublic ? output.publicPlayoutUrl : output.playoutUrl;
  if(playoutUrl) { rows.push({label: "Playout URL", url: playoutUrl}); }

  (output.playoutMethods || []).forEach(method => {
    const url = ApplyPackaging(isPublic ? method.publicUrl : method.url, packaging);

    if(method.licenseServerUrl) {
      const drm = method.label.split(" ").pop();
      rows.push({
        label: method.label,
        children: [
          {label: `${drm} URL`, url},
          {label: "License Server URL", url: isPublic ? method.publicLicenseServerUrl : method.licenseServerUrl}
        ]
      });
    } else {
      rows.push({label: method.label, url});
    }
  });

  return rows;
};

const PackagingSwitch = ({options, value, onChange}) => (
  <Group gap={12} wrap="nowrap">
    {options.map(option => (
      <UnstyledButton
        key={option.value}
        onClick={() => onChange(option.value)}
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          lineHeight: 1,
          paddingBottom: 3,
          cursor: "pointer",
          color: value === option.value ? SELECTED_COLOR : "var(--mantine-color-elv-gray-6)",
          borderBottom: `2px solid ${value === option.value ? SELECTED_COLOR : "transparent"}`,
          borderRadius: 2
        }}
      >
        <Badge
          key={`source-${option.label}`}
          radius={2}
          color={SOURCE_PACKAGING_COLOR_MAP[option.value]}
          c="elv-gray.7"
          tt="uppercase"
          fz={12}
          fw={400}
          style={{cursor: "pointer"}}
          classNames={{label: sharedStyles.badgeLabel}}
        >
          {option.label}
        </Badge>
      </UnstyledButton>
    ))}
  </Group>
);

const CopyControl = ({url}) => (
  <CopyButton value={url} timeout={2000}>
    {({copied, copy}) => (
      <Tooltip label={copied ? "Copied" : "Copy"} position="bottom">
        <ActionIcon
          variant="transparent"
          c="elv-gray.6"
          size={20}
          onClick={event => { event.stopPropagation(); copy(); }}
        >
          {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
        </ActionIcon>
      </Tooltip>
    )}
  </CopyButton>
);

const LabelText = ({children}) => (
  <Text fz="0.875rem" fw={700} c="elv-gray.9">{children}</Text>
);

const UrlText = ({url}) => (
  <Text fz="0.875rem" fw={500} c="elv-gray.9" truncate title={url}>{url}</Text>
);

// Chevron toggle matching the streams-table group rows.
const ToggleControl = ({open}) => (
  <ActionIcon component="div" variant="subtle" size="sm" color="elv-gray.6">
    <IconChevronRight
      size={16}
      style={{transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease"}}
    />
  </ActionIcon>
);

// Fixed column widths: chevron spacer, label, URL (fills the rest), copy (hugs the icon).
// Needed because layout="fixed" derives widths from the first row, whose header cell
// spans columns 2-4.
const ColGroup = () => (
  <colgroup>
    <col style={{width: 40}} />
    <col style={{width: 200}} />
    <col />
    <col style={{width: 40}} />
  </colgroup>
);

const CopyCell = ({url, background}) => (
  <Table.Td px={8} style={{textAlign: "center", background}}>
    {url ? <CopyControl url={url} /> : null}
  </Table.Td>
);

const DataRow = ({row}) => (
  <>
    <Table.Tr>
      <Table.Td />
      <Table.Td><LabelText>{row.label}</LabelText></Table.Td>
      <Table.Td style={{maxWidth: 0}}>{row.url ? <UrlText url={row.url} /> : null}</Table.Td>
      <CopyCell url={row.url} />
    </Table.Tr>
    {
      (row.children || []).map(child => (
        <Table.Tr key={child.label} style={{background: SUBROW_BG}}>
          <Table.Td style={{background: SUBROW_BG}} />
          <Table.Td style={{background: SUBROW_BG}}>
            <Group gap={8} wrap="nowrap" pl={20}>
              <Text fz="0.875rem" c="elv-gray.9">•</Text>
              <LabelText>{child.label}</LabelText>
            </Group>
          </Table.Td>
          <Table.Td style={{maxWidth: 0, background: SUBROW_BG}}><UrlText url={child.url} /></Table.Td>
          <CopyCell url={child.url} background={SUBROW_BG} />
        </Table.Tr>
      ))
    }
  </>
);

// One collapsible table of output URLs (embeddable, playout options, and a URL per
// playout protocol/DRM method) per stream in the group.
const OutputUrlsBySource = ({streams = [], outputUrls = {}, loading = false}) => {
  const [collapsed, setCollapsed] = useState({});
  const [mode, setMode] = useState("authorized");
  const [packaging, setPackaging] = useState("fmp4");
  const Toggle = (id) => setCollapsed(current => ({...current, [id]: !current[id]}));

  return (
    <Box mt={40}>
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap={12} wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <IconChevronRight size={20} color="var(--mantine-color-elv-blue-3)" />
            <Text fz="1.125rem" fw={600} c="elv-blue.3">Output URLs by Source</Text>
          </Group>
          <PackagingSwitch options={PACKAGING_OPTIONS} value={packaging} onChange={setPackaging} />
        </Group>
        <SegmentedControl size="xs" value={mode} onChange={setMode} data={URL_MODES} />
      </Group>

      <Stack gap={12} pt={16}>
        {
          streams.length === 0 &&
          (loading ? <Loader /> : <Text fz={14} c="elv-gray.6">No sources.</Text>)
        }
        {streams.map(stream => {
          const rows = UrlRows(outputUrls[stream.objectId], mode, packaging);
          const open = !collapsed[stream.objectId];

          return (
            <Box
              key={stream.objectId}
              style={{
                border: "1px solid var(--mantine-color-gray-3)",
                borderRadius: 4,
                overflow: "hidden"
              }}
            >
              <Table withRowBorders layout="fixed" styles={{td: {paddingBlock: 15}}}>
                <ColGroup />
                <Table.Thead>
                  <Table.Tr style={{cursor: "pointer"}} onClick={() => Toggle(stream.objectId)}>
                    <Table.Th px={8}>
                      <ToggleControl open={open} />
                    </Table.Th>
                    <Table.Th colSpan={3}>
                      <Text fw={700} fz="0.875rem" c="elv-gray.9">{stream.title || stream.slug}</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                {
                  open &&
                  <Table.Tbody>
                    {
                      rows.length === 0 ?
                        <Table.Tr>
                          <Table.Td />
                          <Table.Td colSpan={3}>
                            {
                              loading ?
                                <Text fz="0.875rem" c="elv-gray.6">Loading URLs...</Text> :
                                <Text fz="0.875rem" c="elv-gray.6">No output URLs available.</Text>
                            }
                          </Table.Td>
                        </Table.Tr> :
                        rows.map(row => <DataRow key={row.label} row={row} />)
                    }
                  </Table.Tbody>
                }
              </Table>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default OutputUrlsBySource;
