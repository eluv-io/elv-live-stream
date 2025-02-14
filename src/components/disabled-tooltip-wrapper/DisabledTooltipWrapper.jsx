import {Box, Tooltip} from "@mantine/core";
import classes from "./DisabledTooltipWrapper.module.css";

const DisabledTooltipWrapper = ({
  children,
  disabled=false,
  tooltipLabel
}) => {
  if(disabled) {
    return (
      <Tooltip.Floating label={tooltipLabel}>
        <Box data-disabled mb={24} className={classes.box}>
          { children }
        </Box>
      </Tooltip.Floating>
    );
  }

  return children;
};

export default DisabledTooltipWrapper;
