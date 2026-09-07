import {Fragment} from "react";
import {Box, Button, Divider, Flex, Group, Text, UnstyledButton} from "@mantine/core";
import styles from "./BatchActions.module.css";

const Separator = () => (
  <Divider orientation="vertical" size={1} color="elv-gray.2" h="50%" style={{alignSelf: "center"}} />
);

const BatchActions = ({
  actions=[],
  endActions=[],
  selectedRecords=[],
  SelectAll,
  mb=20,
}) => {
  const IconDisplay = Icon => <Icon size={16} />;
  const ActionButton = action => (
    <Button
      key={action.id}
      variant="subtle"
      c="elv-gray.9"
      p={"0 8px 0 4px"}
      fw={400}
      miw={0}
      h={30}
      leftSection={action.icon ? IconDisplay(action.icon) : null}
      classNames={{root: styles.button, inner: styles.buttonInner, section: styles.buttonSection}}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      { action.label }
    </Button>
  );
  return (
    <>
      <Box bg="elv-blue.0" p="3px 12px" mb={mb} className={styles.boxRounded}>
        <Flex direction="row" w="100%" h={30} align="center" gap={12}>
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
          {
            [...actions, ...endActions].map(action => (
              <Fragment key={action.id}>
                <Separator />
                { ActionButton(action) }
              </Fragment>
            ))
          }
        </Flex>
      </Box>
    </>
  );
};

export default BatchActions;
