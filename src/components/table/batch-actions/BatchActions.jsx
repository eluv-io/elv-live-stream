import {Box, Button, Divider, Flex, Group, Text, UnstyledButton} from "@mantine/core";
import styles from "./BatchActions.module.css";

const BatchActions = ({
  actions,
  selectedRecords,
  SelectAll,
  mb,
}) => {
  const IconDisplay = Icon => <Icon size={16} />;
  return (
    <>
      <Box bg="elv-blue.0" p="3px 12px" mb={mb} className={styles.boxRounded}>
        <Flex direction="row">
            <Group gap={0}>
              {
                selectedRecords.length === 0 ?
                  <UnstyledButton onClick={SelectAll}>
                    <Text td="underline" fw={400} c="elv-gray.9" fz="0.875rem">Select All</Text>
                  </UnstyledButton> :
                  <Group gap={4}>
                    <Text fw={400} c="elv-gray.9" fz="0.875rem" miw={70}>{selectedRecords.length} selected</Text>
                    <UnstyledButton onClick={SelectAll}>
                      <Group gap={0}>
                        <Text fw={400} c="elv-gray.9" fz="0.875rem">&nbsp;(</Text>
                        <Text td="underline" fw={400} c="elv-gray.9" fz="0.875rem">Select All</Text>
                        <Text fw={400} c="elv-gray.9" fz="0.875rem">)</Text>
                      </Group>
                    </UnstyledButton>
                  </Group>
              }
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
                  h={30}
                  leftSection={IconDisplay(action.icon)}
                  classNames={{root: styles.button, inner: styles.buttonInner}}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  { action.label }
                </Button>
              ))
            }
          </Group>
        </Flex>
      </Box>
    </>
  );
};

export default BatchActions;
