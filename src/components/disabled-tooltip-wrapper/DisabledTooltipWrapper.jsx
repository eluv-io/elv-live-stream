import {Box, Tooltip} from "@mantine/core";
import styles from "./DisabledTooltipWrapper.module.css";

const DisabledTooltipWrapper = ({
  children,
  disabled=false,
  tooltipLabel
}) => {
  if(disabled) {
    return (
      <Tooltip.Floating label={tooltipLabel}>
        <Box data-disabled mb={24} className={styles.box}>
          { children }
        </Box>
      </Tooltip.Floating>
    );
  }

  return children;
};

export default DisabledTooltipWrapper;
