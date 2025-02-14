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
      mb={16}
    />
  );
};

const TextEditorBox = ({
  columns=[],
  editorValue,
  hideDelete=false,
  HandleEditorValueChange,
  HandleDelete
}) => {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <Box w={700}>
      <Paper shadow="none" withBorder p="10px 16px" mb={16}>
        <Group>
          {
            columns.map(column => (
              <Flex key={column.id} direction="column" mr={48}>
                <Text c="dimmed" size="xs">{ column.header }</Text>
                <Text lh={1.125}>{ column.value }</Text>
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
        </Group>
      </Paper>

      <EditorField
        show={showEditor}
        editorValue={editorValue}
        HandleChange={HandleEditorValueChange}
      />
    </Box>
  );
};

export default TextEditorBox;
