import {ActionIcon, Box, Flex, Group, JsonInput, Paper, Title} from "@mantine/core";
import {useState} from "react";
import {EditIcon, TrashIcon} from "@/assets/icons/index.js";

const EditorField = ({
  show,
  editorValue,
  HandleChange
}) => {
  if(!show) { return null; }

  return (
    <JsonInput
      value={editorValue}
      onChange={value => HandleChange({value})}
      autosize
      minRows={5}
      maxRows={15}
      color="elv-gray.9"
      validationError="Invalid JSON"
      formatOnBlur
    />
  );
};

const TextEditorBox = ({
  columns=[],
  header,
  editorValue,
  defaultShowEditor=false,
  hideDelete=false,
  HandleEditorValueChange,
  HandleDelete
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
                    <Title order={4} lh={1.125} lineClamp={1} c="elv-gray.9">
                      { column.value }
                    </Title>
                  </Flex>
                ))
              }
              <Group ml="auto">
                <ActionIcon
                  size={20}
                  variant="transparent"
                  color="elv-neutral.4"
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
            onClick={HandleDelete}
          >
            <TrashIcon />
          </ActionIcon>
        }
      </Group>

      <Box w={width} mb={12}>
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
