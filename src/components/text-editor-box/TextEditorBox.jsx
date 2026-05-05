import {ActionIcon, Box, CopyButton, Flex, Group, JsonInput, Paper, Text, Title, Tooltip} from "@mantine/core";
import {TrashIcon} from "@/assets/icons/index.js";
import {IconCheck, IconCopy, IconPencil} from "@tabler/icons-react";
import {useEffect, useState} from "react";

const TextEditorBox = ({
  columns=[],
  header,
  editorValue,
  expandIcon,
  defaultShowEditor=false,
  hideDelete=false,
  showCopy=true,
  readonly=false,
  HandleEditorValueChange,
  HandleDelete,
  Validate
}) => {
  const [showEditor, setShowEditor] = useState(defaultShowEditor);
  const [localValue, setLocalValue] = useState(editorValue);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLocalValue(editorValue);
  }, [editorValue]);
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
                {
                  showCopy && showEditor &&
                  <CopyButton value={localValue ?? ""}>
                    {({copied, copy}) => (
                      <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                        <ActionIcon
                          size={20}
                          variant="transparent"
                          color={copied ? "teal" : "elv-neutral.4"}
                          onClick={copy}
                        >
                          {copied ? <IconCheck /> : <IconCopy />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                }
                <Tooltip label={expandIcon ? (showEditor ? "Hide" : "Expand") : "Edit"} withArrow>
                  <ActionIcon
                    size={20}
                    variant="transparent"
                    color="elv-neutral.4"
                    onClick={() => setShowEditor(prevState => !prevState)}
                  >
                    {expandIcon ? expandIcon : <IconPencil />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          </Paper>
        </Box>
        {
          !hideDelete && !readonly &&
          <Tooltip label="Delete" withArrow>
            <ActionIcon
              size={20}
              variant="transparent"
              color="elv-neutral.4"
              onClick={HandleDelete}
            >
              <TrashIcon />
            </ActionIcon>
          </Tooltip>
        }
      </Group>

      <Box w={width} mb={12}>
        {
          showEditor &&
          <JsonInput
            readOnly={readonly}
            value={localValue}
            onChange={value => {
              setLocalValue(value);
              try {
                const parsed = JSON.parse(value);
                const customError = Validate ? Validate(parsed) : null;
                setError(customError || null);
                if(!customError) { HandleEditorValueChange({value}); }
              } catch {
                setError("Invalid JSON");
                if(Validate) { Validate(null); }
              }
            }}
            autosize
            minRows={5}
            maxRows={15}
            color="elv-gray.9"
            error={error}
            formatOnBlur
          />
        }
      </Box>
    </Box>
  );
};

export default TextEditorBox;
