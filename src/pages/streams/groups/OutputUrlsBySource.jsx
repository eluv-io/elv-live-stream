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
import CollapsibleSection from "@/components/collapsible-section/CollapsibleSection.jsx";
import {SOURCE_PACKAGING_COLOR_MAP} from "@/utils/constants.ts";
import sharedStyles from "@/assets/shared.module.css";

const URL_MODES = [
  {label: "Authorized", value: "authorized"},
  {label: "Public", value: "public"}
];

const PACKAGING_OPTIONS = [
  {label: "FMP4", value: "fmp4"},
  {label: "TS", value: "ts"}
];

// Renames "playlist" -> "playlist-{type}" (client-js's playoutType convention); no-op for DASH.
const ApplyPackaging = (url, packaging) => url ? url.replace("playlist", `playlist-${packaging}`) : url;

// Flattens one stream's output URLs into rows
const UrlRows = (output, mode, packaging) => {
  if(!output) { return []; }

  const isPublic = mode === "public";

  // TS packaging is served over SRT only
  if(packaging === "ts") {
    const url = isPublic ? output.publicSrtPlayoutUrl : output.srtPlayoutUrl;
    return url ? [{label: "Playout URL", url}] : [];
  }

  const rows = [];
  if(output.embedUrl) { rows.push({label: "Embeddable URL", url: output.embedUrl}); }

  (output.playoutMethods || []).forEach(method => {
    const url = ApplyPackaging(isPublic ? method.publicUrl : method.url, packaging);

    if(method.licenseServerUrl) {
      rows.push({
        label: method.label,
        children: [
          {label: `${method.label} Playout URL`, url},
          {label: `${method.label} License Server URL`, url: isPublic ? method.publicLicenseServerUrl : method.licenseServerUrl}
        ]
      });
    } else {
      rows.push({label: `${method.label} Playout URL`, url});
    }
  });

  return rows;
};

const UrlsByLabel = (rows) => {
  const urlByLabel = {};

  rows.forEach(row => {
    if(row.children) {
      row.children.forEach(child => {
        if(child.url) { urlByLabel[child.label] = child.url; }
      });
    } else if(row.url) {
      urlByLabel[row.label] = row.url;
    }
  });

  return urlByLabel;
};

const AllUrlsJson = (rows) => {
  const urlByLabel = UrlsByLabel(rows);
  return Object.keys(urlByLabel).length === 0 ? "" : JSON.stringify(urlByLabel, null, 2);
};

// Every stream's URLs, keyed by the stream title (the accordion header), as pretty JSON.
// Falls back to slug, then objectId; a duplicate title gets a numeric suffix.
const AllStreamsUrlsJson = ({streams, outputUrls, mode, packaging}) => {
  const urlsByTitle = {};

  streams.forEach(stream => {
    const urlByLabel = UrlsByLabel(UrlRows(outputUrls[stream.objectId], mode, packaging));
    if(Object.keys(urlByLabel).length === 0) { return; }

    const base = stream.title || stream.slug || stream.objectId;
    let key = base;
    for(let i = 2; key in urlsByTitle; i++) { key = `${base} (${i})`; }
    urlsByTitle[key] = urlByLabel;
  });

  return Object.keys(urlsByTitle).length === 0 ? "" : JSON.stringify(urlsByTitle, null, 2);
};

const PackagingSwitch = ({options, value, onChange}) => (
  <Group gap={12} wrap="nowrap">
    {options.map(option => (
      <UnstyledButton
        key={option.value}
        onClick={() => onChange(option.value)}
        c={option.value ? "elv-blue.3" : "var(--mantine-color-elv-gray-6)"}
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          lineHeight: 1,
          paddingBottom: 3,
          cursor: "pointer",
          borderBottom: `2px solid ${value === option.value ? "var(--mantine-color-elv-blue-3)" : "transparent"}`,
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

const CopyControl = ({value}) => (
  <CopyButton value={value} timeout={2000}>
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

const CopyAllButton = ({value, disabled}) => (
  <CopyButton value={value} timeout={2000}>
    {({copied, copy}) => (
      <UnstyledButton
        onClick={copy}
        disabled={disabled || !value}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          opacity: disabled || !value ? 0.4 : 1,
          pointerEvents: disabled || !value ? "none" : undefined
        }}
        mr={11}
      >
        <Text fz="0.65rem" fw={600} c="elv-gray.9">{copied ? "Copied" : "Copy All"}</Text>
        <ActionIcon component="div" variant="transparent" c="elv-gray.6" size={20}>
          {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
        </ActionIcon>
      </UnstyledButton>
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

// Fixed column widths; layout="fixed" derives them from the first row, whose header cell
// spans multiple columns.
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
    {url ? <CopyControl value={url} /> : null}
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
        <Table.Tr key={child.label} bg="elv-gray.1">
          <Table.Td />
          <Table.Td bg="elv-gray.1">
            <Group gap={8} wrap="nowrap" pl={20}>
              <Text fz="0.875rem" c="elv-gray.9">•</Text>
              <LabelText>{child.label}</LabelText>
            </Group>
          </Table.Td>
          <Table.Td bg="elv-gray.1" maw={0}><UrlText url={child.url} /></Table.Td>
          <CopyCell url={child.url} background="var(--mantine-color-elv-gray-1)" />
        </Table.Tr>
      ))
    }
  </>
);

const OutputUrlsBySource = ({streams = [], outputUrls = {}, loading = false}) => {
  const [collapsed, setCollapsed] = useState({});
  const [mode, setMode] = useState("authorized");
  const [packaging, setPackaging] = useState("fmp4");
  const Toggle = (id) => setCollapsed(current => ({...current, [id]: !current[id]}));

  return (
    <Box mt={40}>
      <CollapsibleSection
        title="Output URLs by Source"
        defaultOpen
        titleAside={
          <PackagingSwitch options={PACKAGING_OPTIONS} value={packaging} onChange={setPackaging} />
        }
        actions={
          <Group gap={16} wrap="nowrap">
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={setMode}
              data={URL_MODES}
              styles={{
                root: {backgroundColor: "#e0e0e0", borderRadius: 4},
                label: {fontSize: "0.75rem", fontWeight: 500, color: "var(--mantine-color-elv-gray-9)"}
              }}
            />
            <CopyAllButton
              value={AllStreamsUrlsJson({streams, outputUrls, mode, packaging})}
              disabled={loading}
            />
          </Group>
        }
      >
        <Stack gap={12} pt={16}>
          {
            streams.length === 0 &&
            (loading ? <Loader /> : <Text fz={14} c="elv-gray.6">No sources.</Text>)
          }
          {streams.map(stream => {
            const rows = UrlRows(outputUrls[stream.objectId], mode, packaging);
            const open = !collapsed[stream.objectId];
            const allUrls = AllUrlsJson(rows);

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
                      <Table.Th colSpan={2}>
                        <Text fw={700} fz="0.875rem" c="elv-gray.9">{stream.title || stream.slug}</Text>
                      </Table.Th>
                      <Table.Th px={8} style={{textAlign: "center"}}>
                        {allUrls ? <CopyControl value={allUrls} /> : null}
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
      </CollapsibleSection>
    </Box>
  );
};

export default OutputUrlsBySource;
