import {ActionIcon, Group, Text, Tooltip} from "@mantine/core";
import {useClipboard} from "@mantine/hooks";
import {IconCopy} from "@tabler/icons-react";

const CopyButton = (({
  value,
  copyText="Copy",
  copiedText="Copied",
  textComponent,
  position="bottom"
}) => {
  const clipboard = useClipboard();

  return (
    <Group gap={8}>
      {
        textComponent ?
          textComponent :
          <Text fz={12} fw={400} lh="normal">
            { value }
          </Text>
      }
      <Tooltip label={clipboard.copied ? copiedText : copyText} position={position}>
        <ActionIcon
          variant="transparent"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            clipboard.copy(value);
          }}
        >
          <IconCopy color="var(--mantine-color-elv-gray-6)" height={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
});

export default CopyButton;
