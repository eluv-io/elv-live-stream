import {useState} from "react";
import {Box, Collapse, Group, Text, UnstyledButton} from "@mantine/core";
import {IconChevronRight} from "@tabler/icons-react";

const CollapsibleSection = ({title, defaultOpen = false, mb, titleAside, actions, children}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box mb={mb}>
      <Group justify="space-between" wrap="nowrap" mb={4}>
        <Group gap={12} wrap="nowrap">
          <UnstyledButton onClick={() => setOpen(prev => !prev)}>
            <Group gap={8} wrap="nowrap">
              <IconChevronRight
                size={20}
                color="var(--mantine-color-elv-blue-3)"
                style={{transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease"}}
              />
              <Text fz="1.125rem" fw={600} c="elv-blue.3">{title}</Text>
            </Group>
          </UnstyledButton>
          {titleAside}
        </Group>
        {actions}
      </Group>
      <Collapse expanded={open}>
        {children}
      </Collapse>
    </Box>
  );
};

export default CollapsibleSection;
