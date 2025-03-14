import {Box, Group, Indicator, Text} from "@mantine/core";
import {StatusIndicator} from "@/utils/helpers.js";
import styles from "./StatusText.module.css";
import {QUALITY_MAP, STATUS_TEXT} from "@/utils/constants.js";
import {IconAlertCircle} from "@tabler/icons-react";

const StatusText = ({status, quality, withBorder=false, size="sm"}) => {
  if(!status) { return null; }
  const SIZE_MAPPINGS = {
    "xs": {
      size: 5,
      ml: 13
    },
    "md": {
      size: 7,
      ml: 16
    }
  };

  if(quality === QUALITY_MAP.GOOD || !quality) {
    return (
      <Box className={withBorder ? styles.box : ""} title={STATUS_TEXT[status]}>
        <Indicator
          color={StatusIndicator(status)}
          position="middle-start"
          size={SIZE_MAPPINGS[size].size}
          offset={4}
        >
          <Text
            fz={14}
            ml={SIZE_MAPPINGS[size].ml}
            fw={500}
            lh={1}
            c="elv-gray.9"
          >
            { STATUS_TEXT[status] }
          </Text>
        </Indicator>
      </Box>
    );
  } else {
    return (
      <Box className={withBorder ? styles.box : ""} ml="-3px">
        <Group gap={5}>
          <IconAlertCircle color="var(--mantine-color-elv-orange-3)" width={14} />
          <Text fz={14} fw={500} c="elv-gray.9" lh={1}>
            { STATUS_TEXT[status] }
          </Text>
        </Group>
      </Box>
    );
  }
};

export default StatusText;
