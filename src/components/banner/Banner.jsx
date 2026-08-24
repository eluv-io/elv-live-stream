import {Box, Text} from "@mantine/core";
import styles from "./Banner.module.css";

// Shared full-width top-of-page banner shell used by ErrorBanner and
// UpdateBanner. The center group (message + inlineAction) is kept visually
// centered via a symmetric spacer/endAction flex pair - endAction pins to
// the far right (e.g. ErrorBanner's dismiss icon) without pulling the
// center group off-center.
const Banner = ({message, inlineAction, endAction}) => {
  if(!message) { return null; }

  return (
    <Box className={styles.root}>
      <Box className={styles.spacer} />
      <Box className={styles.center}>
        <Text className={styles.message}>{message}</Text>
        {inlineAction}
      </Box>
      <Box className={styles.end}>
        {endAction}
      </Box>
    </Box>
  );
};

export default Banner;
