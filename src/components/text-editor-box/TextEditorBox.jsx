import {ActionIcon, Box, Card, Flex, Group, Indicator, JsonInput, Text} from "@mantine/core";
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

const PlayoutIndicator = ({color, title}) => {
  return (
    <Flex align="center">
      <Indicator
        color={color}
        position="middle-start"
        size={5}
        offset={4}
      >
        <Text
          fz={14}
          ml={13}
          fw={400}
          lh={1}
          c="elv-gray.9"
        >
          { title }
        </Text>
      </Indicator>
    </Flex>
  );
};

const PlayoutProfileEditor = ({
  title,
  value,
  audioLabel,
  videoLabel,
  defaultShowEditor=false,
  HandleEditorValueChange,
  hideDelete=false,
  HandleDelete
}) => {
  const [showEditor, setShowEditor] = useState(defaultShowEditor);
  const width = 700;

  return (
    <Box w={width}>
      <Card
        bdrs={4}
        bd="1px solid gray.3"
        p="20px 16px"
        style={{ overflow: "visible" }}
      >
        <Group w="100%" align="center" pos="relative">
          <Text fw={600} mb={8}>{title}</Text>
          <ActionIcon
            size={20}
            variant="transparent"
            color="elv-neutral.4"
            ml="auto"
            onClick={() => setShowEditor(prevState => !prevState)}
          >
            <EditIcon />
          </ActionIcon>
          {
            !hideDelete &&
            <ActionIcon
              size={20}
              variant="transparent"
              color="elv-neutral.4"
              pos="absolute"
              right={-50}
              top="50%"
              style={{ transform: "translateY(-50%)" }}
              onClick={HandleDelete}
            >
              <TrashIcon />
            </ActionIcon>
          }
        </Group>
        <Flex align="center" gap={8}>
          <PlayoutIndicator color="elv-violet.4" title={`${audioLabel ?? 0} audio`} />
          <PlayoutIndicator color="elv-green.8" title={`${videoLabel ?? 0} video`} />
        </Flex>
      </Card>
      <Box w={width} mb={12}>
        <EditorField
          show={showEditor}
          editorValue={value}
          HandleChange={HandleEditorValueChange}
        />
      </Box>
    </Box>
  );
};

export default PlayoutProfileEditor;
