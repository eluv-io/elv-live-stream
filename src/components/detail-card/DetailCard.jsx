import {ActionIcon, Box, Divider, Flex, Group, Stack, Text, Tooltip} from "@mantine/core";
import styles from "./DetailCard.module.css";
import {IconCopy} from "@tabler/icons-react";
import {useClipboard} from "@mantine/hooks";

const ValueSection = ({value, copyable=false, lineClamp}) => {
  const clipboard = useClipboard(({timeout: 500}));

  if(typeof value === "string") {
    return (
      <Flex gap={4} align="center" miw={0}>
        <Text c="elv-gray.7" fw={400} fz="0.875rem" truncate={lineClamp ? "end" : undefined} flex={1} miw={0}>{ value }</Text>
        {
          copyable ?
            <Tooltip
              label={clipboard.copied ? "Copied" : "Copy"}
              position="bottom"
            >
              <ActionIcon
                variant="transparent"
                c="elv-gray.6"
                size={18}
                onClick={() => clipboard.copy(value)}
              >
                <IconCopy size={16} />
              </ActionIcon>
            </Tooltip> : null
        }
      </Flex>
    );
  } else {
    return value;
  }
};

const DetailCard = ({
  title,
  titleRightSection,
  details=[]
}) => {
  return (
    <Box w={380} bd="1px solid elv-gray.2" radius={5} className={styles.boxWrapper}>
      <Box p={12}>
        <Group>
          <Text fw={600} fz="0.875rem" c="elv-gray.7">{ title }</Text>
          <Flex ml="auto">
            {
              titleRightSection ? titleRightSection : null
            }
          </Flex>
        </Group>
        <Divider c="elv-gray.2" mt={8} mb={8} />

        <Stack gap={6}>
          {
            details.map((detail, i) => (
              <Flex key={`detail-${title}-${i}-${detail.label}`} align="flex-start" gap={8} w="100%">
                <Text c="elv-gray.7" fw={400} fz="0.875rem" className={styles.noWrapText}>{ detail.label }:</Text>
                <ValueSection value={detail.value} copyable={detail.copyable} lineClamp={detail.lineClamp} />
              </Flex>
            ))
          }
        </Stack>
      </Box>
    </Box>
  );
};

export default DetailCard;
