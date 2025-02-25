import {Box, Group, Indicator, Text} from "@mantine/core";
import {StatusIndicator} from "@/utils/helpers.js";
import styles from "./StatusText.module.css";
import {QUALITY_MAP, STATUS_TEXT} from "@/utils/constants.js";
import {IconAlertCircle} from "@tabler/icons-react";

const StatusText = ({status, quality, withBorder=false, size="sm"}) => {
  if(!status) { return null; }
  const SIZE_MAPPINGS = {
    "xs": {
      size: 6,
      ml: 14
    },
    "sm": {
      size: 8,
      ml: 18
    }
  };

  if(quality === QUALITY_MAP.GOOD || !quality) {
    return (
      <Box className={withBorder ? styles.box : ""} title={STATUS_TEXT[status]}>
        <Indicator color={StatusIndicator(status)} position="middle-start" size={SIZE_MAPPINGS[size].size} offset={4}>
          <Text fz={size} ml={SIZE_MAPPINGS[size].ml}>
            {STATUS_TEXT[status]}
          </Text>
        </Indicator>
      </Box>
    );
  } else {
    return (
      <Box className={withBorder ? styles.box : ""}>
        <Group gap={0}>
          <IconAlertCircle color="var(--mantine-color-elv-orange-3)" width={15} />
          <Text fz="sm" ml="md">
            {STATUS_TEXT[status]}
          </Text>
        </Group>
      </Box>
    );
  }
};

export default StatusText;
