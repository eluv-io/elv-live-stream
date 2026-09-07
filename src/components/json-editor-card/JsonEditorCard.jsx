import {useState} from "react";
import {ActionIcon, Box, Button, CopyButton, Group, JsonInput, Text, Tooltip} from "@mantine/core";
import {IconCheck, IconCopy, IconPencil, IconPlus, IconTrash} from "@tabler/icons-react";

// Generalized extraction of ConfigProfiles.jsx's ProfileEditorRow pattern
// (JsonInput + live JSON.parse validation + CopyButton overlay), decoupled
// from profileStore so it can be reused anywhere a free-form JSON blob needs
// editing - e.g. Advanced Encoding Parameters in FMP4/CMAF Packaging and
// per Alternate Transcode.
const JsonEditorCard = ({value, onChange, title="Advanced Encoding Parameters", disabled}) => {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState(null);

  if(!value && !editing) {
    return (
      <Button
        variant="outline"
        size="xs"
        leftSection={<IconPlus size={14} />}
        disabled={disabled}
        onClick={() => {
          setLocalValue("{\n  \n}");
          setError(null);
          setEditing(true);
        }}
      >
        Add {title}
      </Button>
    );
  }

  const displayValue = editing ? localValue : JSON.stringify(value ?? {}, null, 2);

  return (
    <Box style={{border: "1px solid var(--mantine-color-elv-gray-1)", borderRadius: 5}} p={12}>
      <Group justify="space-between" mb={8} wrap="nowrap">
        <Text fz="0.875rem" fw={600} c="elv-black.3">{title}</Text>
        <Group gap={4} wrap="nowrap">
          <CopyButton value={displayValue ?? ""}>
            {({copied, copy}) => (
              <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                <ActionIcon size={18} variant="transparent" color={copied ? "teal" : "elv-gray.6"} onClick={copy}>
                  {copied ? <IconCheck /> : <IconCopy />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          <Tooltip label={editing ? "Done editing" : "Edit"} withArrow>
            <ActionIcon
              size={18}
              variant="transparent"
              color="elv-gray.6"
              disabled={disabled}
              onClick={() => {
                if(!editing) { setLocalValue(JSON.stringify(value ?? {}, null, 2)); }
                setError(null);
                setEditing(prev => !prev);
              }}
            >
              <IconPencil />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete" withArrow>
            <ActionIcon
              size={18}
              variant="transparent"
              color="elv-gray.6"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                setEditing(false);
                setError(null);
              }}
            >
              <IconTrash />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <JsonInput
        value={displayValue}
        readOnly={!editing}
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
  );
};

export default JsonEditorCard;
