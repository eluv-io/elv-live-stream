import {ActionIcon, Box, Code, ScrollArea, Text, Tooltip} from "@mantine/core";
import {useClipboard} from "@mantine/hooks";
import {IconCheck, IconCopy} from "@tabler/icons-react";

const LogView = ({entries=[], emptyText="No entries"}) => {
  const clipboard = useClipboard({timeout: 3000});

  if(!entries.length) {
    return <Text c="dimmed" fz={14} py={16}>{ emptyText }</Text>;
  }

  const text = entries.join("\n");

  return (
    <Box pos="relative">
      <ScrollArea.Autosize mah={400}>
        <Code block style={{whiteSpace: "pre-wrap", wordBreak: "break-word"}} pr={40}>
          { text }
        </Code>
      </ScrollArea.Autosize>
      <Tooltip label={clipboard.copied ? "Copied" : "Copy"} position="bottom">
        <ActionIcon
          variant="subtle"
          color="elv-gray.6"
          pos="absolute"
          top={8}
          right={8}
          aria-label="Copy log"
          onClick={() => clipboard.copy(text)}
        >
          { clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} /> }
        </ActionIcon>
      </Tooltip>
    </Box>
  );
};

export default LogView;
