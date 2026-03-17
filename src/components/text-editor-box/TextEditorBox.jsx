import {ActionIcon, Box, Flex, Group, JsonInput, Paper, Text, Title} from "@mantine/core";
import {useState} from "react";
import {EditIcon, TrashIcon} from "@/assets/icons/index.js";
import {IconRestore} from "@tabler/icons-react";

const TextEditorBox = ({
  columns=[],
  header,
  editorValue,
  defaultShowEditor=false,
  hideDelete=false,
  HandleEditorValueChange,
  HandleDelete,
  HandleReset
}) => {
  const [showEditor, setShowEditor] = useState(defaultShowEditor);
  const width = 700;

  return (
    <Box>
      <Title order={3} color="elv-gray.9" mb={4}>{ header }</Title>
      <Group w="100%" mb={7}>
        <Box w={width}>
          <Paper shadow="none" withBorder p="10px 16px">
            <Group>
              {
                columns.map(column => (
                  <Flex key={column.id} direction="column" mr={48} maw="80%">
                    <Text lh={1.125} fw={500} fz={14} truncate="end" c="elv-gray.9" w="100%">
                      { column.value }
                    </Text>
                  </Flex>
                ))
              }
              <Group ml="auto">
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="elv-neutral.4"
                  title="Reset"
                  onClick={HandleReset}
                >
                  <IconRestore />
                </ActionIcon>
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="elv-neutral.4"
                  title="Edit"
                  onClick={() => setShowEditor(prevState => !prevState)}
                >
                  <EditIcon />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        </Box>
        {
          !hideDelete &&
          <ActionIcon
            size={20}
            variant="transparent"
            color="elv-neutral.4"
            title="Delete"
            onClick={HandleDelete}
          >
            <TrashIcon />
          </ActionIcon>
        }
      </Group>

      <Box w={width} mb={12}>
        {
          showEditor &&
          <JsonInput
            value={editorValue}
            onChange={value => HandleEditorValueChange({value})}
            autosize
            minRows={5}
            maxRows={15}
            color="elv-gray.9"
            validationError="Invalid JSON"
            formatOnBlur
          />
        }
      </Box>
    </Box>
  );
};

export default TextEditorBox;
