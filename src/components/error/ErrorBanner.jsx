import {observer} from "mobx-react-lite";
import {rootStore} from "@/stores/index.ts";
import {ActionIcon} from "@mantine/core";
import {IconX} from "@tabler/icons-react";
import Banner from "@/components/banner/Banner.jsx";

const ErrorBanner = observer(() => (
  <Banner
    message={rootStore.errorMessage}
    endAction={
      <ActionIcon onClick={() => rootStore.SetErrorMessage(undefined)}>
        <IconX />
      </ActionIcon>
    }
  />
));

export default ErrorBanner;
