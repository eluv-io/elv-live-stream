import {useState} from "react";
import {Box, Tooltip} from "@mantine/core";
import styles from "./DisabledTooltipWrapper.module.css";

const DisabledTooltipWrapper = ({
  children,
  disabled=false,
  allowView=false,
  tooltipLabel
}) => {
  const [overInteractive, setOverInteractive] = useState(false);

  if(disabled) {
    return (
      <Tooltip.Floating label={tooltipLabel} disabled={overInteractive}>
        <Box
          data-disabled
          data-allow-view={allowView || undefined}
          className={styles.box}
          onMouseOver={allowView ? e => setOverInteractive(!!e.target.closest("button")) : undefined}
          onMouseLeave={allowView ? () => setOverInteractive(false) : undefined}
        >
          { children }
        </Box>
      </Tooltip.Floating>
    );
  }

  return children;
};

export default DisabledTooltipWrapper;
