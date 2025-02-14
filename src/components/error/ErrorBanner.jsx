import {observer} from "mobx-react-lite";
import {rootStore} from "@/stores";
import {ActionIcon} from "@mantine/core";
import {IconX} from "@tabler/icons-react";

const ErrorBanner = observer(() => {
  if(!rootStore.errorMessage) { return null; }

  return (
    <div className="error-banner">
      <div className="error-banner__message">
        {rootStore.errorMessage}
      </div>
      <ActionIcon onClick={() => rootStore.SetErrorMessage(undefined)}>
        <IconX />
      </ActionIcon>
    </div>
  );
});

export default ErrorBanner;
