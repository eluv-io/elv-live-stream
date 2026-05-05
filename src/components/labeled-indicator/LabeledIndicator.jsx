import {Box, Flex, Group, Indicator, Text} from "@mantine/core";
import styles from "./LabeledIndicator.module.css";
import {IconAlertCircle} from "@tabler/icons-react";

const LabeledIndicator = ({
  label,
  color,
  showWarning=false,
  withBorder=false,
  size="sm",
  fz,
  fw=500,
  c="elv-gray.9"
}) => {
  if(!label) { return null; }
  const SIZE_MAPPINGS = {
    "xs": {
      size: 4.5,
      ml: 10,
      fz: "0.5625rem"
    },
    "sm": {
      size: 5,
      ml: 13,
      fz: 14
    },
    "md": {
      size: 7,
      ml: 16,
      fz: 14
    }
  };

  if(showWarning) {
    return (
      <Box className={withBorder ? styles.box : ""} ml="-3px">
        <Group gap={5}>
          <IconAlertCircle color="var(--mantine-color-elv-orange-3)" width={14} />
          <Text fz={14} fw={500} c="elv-gray.9" lh={1}>
            { label }
          </Text>
        </Group>
      </Box>
    );
  } else {
    return (
      <Flex direction="row" align="center" className={withBorder ? styles.box : ""} title={label}>
        <Indicator
          color={color}
          position="middle-start"
          size={SIZE_MAPPINGS[size].size}
          offset={4}
        >
          <Text
            fz={fz ?? SIZE_MAPPINGS[size].fz}
            ml={SIZE_MAPPINGS[size].ml}
            fw={fw}
            lh={1}
            c={c}
          >
            { label }
          </Text>
        </Indicator>
      </Flex>
    );
  }
};

export default LabeledIndicator;
