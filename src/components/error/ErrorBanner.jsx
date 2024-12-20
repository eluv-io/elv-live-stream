import {observer} from "mobx-react-lite";
import {rootStore} from "@/stores";
import {ActionIcon, Box, Text} from "@mantine/core";
import {IconX} from "@tabler/icons-react";
import styles from "./ErrorBanner.module.css";

const ErrorBanner = observer(() => {
  if(!rootStore.errorMessage) { return null; }

  return (
    <Box className={styles.root}>
      <Text>
        {rootStore.errorMessage}
      </Text>
      <ActionIcon onClick={() => rootStore.SetErrorMessage(undefined)}>
        <IconX />
      </ActionIcon>
    </Box>
  );
});

export default ErrorBanner;
