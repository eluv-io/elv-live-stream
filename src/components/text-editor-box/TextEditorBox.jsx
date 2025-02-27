import {ActionIcon, Box, Flex, Group, Paper, Text, Textarea} from "@mantine/core";
import {useState} from "react";
import {EditIcon, TrashIcon} from "@/assets/icons/index.js";

const EditorField = ({
  show,
  editorValue,
  HandleChange
}) => {
  if(!show) { return null; }

  return (
    <Textarea
      value={editorValue}
      onChange={(event) => HandleChange({value: event.target.value})}
      autosize
      minRows={5}
      maxRows={15}
    />
  );
};

const TextEditorBox = ({
  columns=[],
  editorValue,
  defaultShowEditor=false,
  hideDelete=false,
  HandleEditorValueChange,
  HandleDelete
}) => {
  const [showEditor, setShowEditor] = useState(defaultShowEditor);
  const width = 700;
  const marginBottom = 16;

  return (
    <Box>
      <Group w="100%" mb={marginBottom}>
        <Box w={width}>
          <Paper shadow="none" withBorder p="10px 16px">
            <Group>
              {
                columns.map(column => (
                  <Flex key={column.id} direction="column" mr={48} maw="80%">
                    <Text c="dimmed" size="xs">{ column.header }</Text>
                    <Text lh={1.125} truncate="end">{ column.value }</Text>
                  </Flex>
                ))
              }
              <Group ml="auto">
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="gray"
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
            color="gray"
            onClick={HandleDelete}
          >
            <TrashIcon />
          </ActionIcon>
        }
      </Group>

      <Box w={width} mb={marginBottom}>
        <EditorField
          show={showEditor}
          editorValue={editorValue}
          HandleChange={HandleEditorValueChange}
        />
      </Box>
    </Box>
  );
};

export default TextEditorBox;
