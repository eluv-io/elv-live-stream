import {useState} from "react";
import {ActionIcon, Box, CopyButton, Group, Loader, Stack, Table, Text, Tooltip} from "@mantine/core";
import {IconCheck, IconChevronRight, IconCopy} from "@tabler/icons-react";

const SUBROW_BG = "#F5F5F5";

// Flattens one stream's output URLs into rows. A DRM method (e.g. Widevine) becomes a
// parent row with a blank URL plus two sub-rows: the playout URL and the license server URL.
const UrlRows = (output) => {
  if(!output) { return []; }

  const rows = [];
  if(output.embedUrl) { rows.push({label: "Embeddable URL", url: output.embedUrl}); }
  if(output.playoutUrl) { rows.push({label: "Playout URL", url: output.playoutUrl}); }

  (output.playoutMethods || []).forEach(method => {
    if(method.licenseServerUrl) {
      const drm = method.label.split(" ").pop();
      rows.push({
        label: method.label,
        children: [
          {label: `${drm} URL`, url: method.url},
          {label: "License Server URL", url: method.licenseServerUrl}
        ]
      });
    } else {
      rows.push({label: method.label, url: method.url});
    }
  });

  return rows;
};

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
  const Toggle = (id) => setCollapsed(current => ({...current, [id]: !current[id]}));

  return (
    <Box mt={40}>
      <Group gap={8} wrap="nowrap" mb={4}>
        <IconChevronRight size={20} color="var(--mantine-color-elv-blue-3)" />
        <Text fz="1.125rem" fw={600} c="elv-blue.3">Output URLs by Source</Text>
      </Group>

      <Stack gap={20} pt={16}>
        {
          streams.length === 0 &&
          (loading ? <Loader /> : <Text fz={14} c="elv-gray.6">No sources.</Text>)
        }
        {streams.map(stream => {
          const rows = UrlRows(outputUrls[stream.objectId]);
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
                                <Loader size="sm" /> :
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
