import {Button, Flex, Group, TextInput} from "@mantine/core";
import {IconSearch} from "@tabler/icons-react";
import styles from "./Actions.module.css";

const Actions = ({
  actions,
  mb=20,
  searchValue,
  onSearchChange
}) => {
  return (
    <>
      <Flex w="100%" align="start" mb={mb}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<IconSearch width={15} height={15} />}
          value={searchValue}
          onChange={onSearchChange}
        />
        <Group ml="auto" gap={8}>
          {
            actions.map(action => (
              <Button
                key={action.id}
                variant={action.variant}
                onClick={action.onClick}
              >
                { action.label }
              </Button>
            ))
          }
        </Group>
      </Flex>

    </>
  );
};

export default Actions;
