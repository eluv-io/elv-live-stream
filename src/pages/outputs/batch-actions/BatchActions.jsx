import {ActionIcon, Box, Button, Divider, Flex, Group, Text, Transition, UnstyledButton} from "@mantine/core";
import {IconCheck, IconMobiledata, IconCancel, IconRotateClockwise, IconX} from "@tabler/icons-react";
import styles from "./BatchActions.module.css";

const BatchActions = ({selectedRecords, SelectAll, ClearSelection}) => {
  const actions = [
    {icon: IconMobiledata, label: "Map to a stream", id: "batch-map-stream", onClick: () => {}},
    {icon: IconCheck, label: "Enable", id: "batch-enable", onClick: () => {}},
    {icon: IconCancel, label: "Disable", id: "batch-disable", onClick: () => {}},
    {icon: IconRotateClockwise, label: "Reset", id: "batch-reset", onClick: () => {}},
  ];

  const IconDisplay = Icon => <Icon size={16} />;

  const visible = selectedRecords && selectedRecords.length > 0;

  return (
    <Transition mounted={visible} transition="fade" duration={150} timingFunction="ease">
      {(transitionStyles) => (
      <Box bg="elv-blue.0" p="3px 12px" radius={4} style={transitionStyles}>
        <Flex direction="row">
          <Group gap={16}>
            <ActionIcon
              variant="subtle"
              c="elv-gray.9"
              onClick={ClearSelection}
            >
              { IconDisplay(IconX) }
            </ActionIcon>
            <Group gap={0}>
              <Text fw={400} c="elv-gray.9" fz="0.875rem" miw={70}>{selectedRecords.length} selected</Text>
              <UnstyledButton onClick={SelectAll}>
                <Group gap={0}>
                  <Text fw={400} c="elv-gray.9" fz="0.875rem">&nbsp;(</Text>
                  <Text td="underline" fw={400} c="elv-gray.9" fz="0.875rem">Select All</Text>
                  <Text fw={400} c="elv-gray.9" fz="0.875rem">)</Text>
                </Group>
              </UnstyledButton>
            </Group>
          </Group>
          <Divider orientation="vertical" color="elv-gray.2" ml={16} mr={16} />
          <Group gap={12}>
            {
              actions.map(action => (
                <Button
                  key={action.id}
                  variant="subtle"
                  c="elv-gray.9"
                  p={"0 8px 0 4px"}
                  fw={400}
                  miw={0}
                  leftSection={IconDisplay(action.icon)}
                  classNames={{root: styles.button}}
                >
                  { action.label }
                </Button>
              ))
            }
          </Group>
        </Flex>
      </Box>
      )}
    </Transition>
  );
};

export default BatchActions;
