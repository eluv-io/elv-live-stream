import {useState} from "react";
import {Box, Collapse, Group, Text, UnstyledButton} from "@mantine/core";
import {IconChevronRight} from "@tabler/icons-react";

// Chevron accordion matching the streams-table group rows: a click-to-toggle header
// with a chevron that rotates 90deg when expanded.
const CollapsibleSection = ({title, defaultOpen = false, mb, children}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box mb={mb}>
      <UnstyledButton onClick={() => setOpen(prev => !prev)} w="100%">
        <Group gap={8} wrap="nowrap">
          <IconChevronRight
            size={20}
            color="var(--mantine-color-elv-blue-3)"
            style={{transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease"}}
          />
          <Text fz="1.125rem" fw={600} c="elv-blue.3">{title}</Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        {children}
      </Collapse>
    </Box>
  );
};

export default CollapsibleSection;
