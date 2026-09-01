import {observer} from "mobx-react-lite";
import {rootStore} from "@/stores/index.ts";
import {Alert} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";

// Top-level banner for runtime failures (e.g. tenant data load errors set via
// rootStore.SetErrorMessage in DataStore). Mirrors the Outputs "not set up"
// warning layout - icon, title, description - but red, since this is a failure
// rather than a setup gap.
const ErrorBanner = observer(() => {
  if(!rootStore.errorMessage) { return null; }

  const title = rootStore.errorMessage.replace(/^error:\s*/i, "");

  return (
    <Alert
      variant="light"
      color="elv-red.9"
      radius={0}
      icon={<IconAlertTriangle />}
      title={title}
      withCloseButton
      onClose={() => rootStore.SetErrorMessage(undefined)}
      styles={{root: {backgroundColor: "var(--mantine-color-elv-red-2)"}}}
    >
      Please ensure all tenant settings are configured.
    </Alert>
  );
});

export default ErrorBanner;
