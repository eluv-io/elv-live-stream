import {Box, Flex, Group, Indicator, Text, Tooltip, UnstyledButton} from "@mantine/core";
import styles from "./LabeledIndicator.module.css";
import {IconAlertCircle} from "@tabler/icons-react";

const LabeledIndicator = ({
  label,
  color,
  showWarning=false,
  showError=false,
  tooltip=null,
  onClick=null,
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

  if(showWarning || showError) {
    const content = (
      <Group gap={5} wrap="nowrap">
        <IconAlertCircle
          color={`var(--mantine-color-elv-${showError ? "red-4" : "orange-3"})`}
          width={14}
          aria-label={showError ? "Errors" : "Warning"}
        />
        <Text fz={14} fw={fw} c={c} lh={1}>
          { label }
        </Text>
      </Group>
    );

    return (
      <Tooltip label={tooltip} disabled={!tooltip} multiline maw={400} withinPortal>
        <Box className={withBorder ? styles.box : ""} ml="-3px">
          {
            onClick ?
              <UnstyledButton onClick={onClick} aria-label="View error log">{ content }</UnstyledButton> :
              content
          }
        </Box>
      </Tooltip>
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
