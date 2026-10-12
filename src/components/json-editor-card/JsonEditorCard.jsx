import {useState} from "react";
import {ActionIcon, Box, CopyButton, Group, JsonInput, Text, Tooltip} from "@mantine/core";
import {IconCheck, IconCopy, IconPencil, IconTrash} from "@tabler/icons-react";

// Mirrors ConfigProfiles.jsx's row + rowExpansion exactly - the pencil
// toggles expansion (DataTable's expandedKeys) to reveal a bordered
// ProfileEditorRow (JsonInput + live JSON.parse validation + CopyButton
// overlay), without the DataTable, since this always edits a single field
// rather than a list of records. Reused wherever a free-form JSON blob
// needs editing - e.g. Advanced Encoding Parameters in FMP4/CMAF Packaging
// and per Alternate Transcode. `shaded` toggles the header background off
// for recording-panel usages.
const JsonEditorCard = ({value, onChange, title="Advanced Encoding Parameters", disabled, shaded=true}) => {
  const [expanded, setExpanded] = useState(!!value);
  const [localValue, setLocalValue] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState(null);

  return (
    <Box style={{border: "1px solid var(--mantine-color-elv-gray-1)", borderRadius: 5, overflow: "hidden"}}>
      <Group
        justify="space-between"
        wrap="nowrap"
        px={16}
        py={10}
        style={shaded ? {backgroundColor: "var(--mantine-color-elv-gray-0)"} : undefined}
      >
        <Text fz="0.875rem" fw={600} c="elv-gray.9">{title}</Text>
        <Group gap={12} wrap="nowrap">
          <Tooltip label={expanded ? "Collapse" : "Edit"} withArrow>
            <ActionIcon
              size={20}
              variant="transparent"
              color="elv-gray.6"
              disabled={disabled}
              onClick={() => {
                if(!expanded) { setLocalValue(JSON.stringify(value ?? {}, null, 2)); }
                setError(null);
                setExpanded(prev => !prev);
              }}
            >
              <IconPencil />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Clear" withArrow>
            <ActionIcon
              size={20}
              variant="transparent"
              color="elv-gray.6"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                setLocalValue("{}");
                setExpanded(false);
                setError(null);
              }}
            >
              <IconTrash />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {
        expanded &&
        <Box pos="relative" p={12} style={{borderTop: "1px solid var(--mantine-color-elv-gray-1)"}}>
          <Box pos="absolute" top={20} right={24} style={{zIndex: 1}}>
            <CopyButton value={localValue ?? ""}>
              {({copied, copy}) => (
                <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                  <ActionIcon size={18} variant="transparent" color={copied ? "teal" : "elv-gray.6"} onClick={copy}>
                    {copied ? <IconCheck /> : <IconCopy />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Box>
          <JsonInput
            value={localValue}
            disabled={disabled}
            onChange={val => {
              setLocalValue(val);
              try {
                const parsed = JSON.parse(val);
                setError(null);
                onChange(parsed);
              } catch {
                setError("Invalid JSON");
              }
            }}
            autosize
            minRows={5}
            maxRows={15}
            error={error}
            formatOnBlur
            styles={{input: {border: "none"}}}
          />
        </Box>
      }
    </Box>
  );
};

export default JsonEditorCard;
