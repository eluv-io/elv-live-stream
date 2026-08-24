import {useEffect} from "react";
import {observer} from "mobx-react-lite";
import {Button} from "@mantine/core";
import {versionStore} from "@/stores/index.ts";
import Banner from "@/components/banner/Banner.jsx";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const UpdateBanner = observer(() => {
  // Recursive setTimeout (not setInterval) so a slow/offline check can't
  // stack a second one on top of it - matches the polling pattern in DataWrapper.
  useEffect(() => {
    let canceled = false;
    let timeoutId;

    const Schedule = () => {
      timeoutId = setTimeout(async () => {
        await versionStore.CheckForUpdate();
        if(!canceled) { Schedule(); }
      }, CHECK_INTERVAL_MS);
    };

    const CheckOnFocus = () => {
      if(document.visibilityState === "visible") {
        versionStore.CheckForUpdate();
      }
    };

    Schedule();
    document.addEventListener("visibilitychange", CheckOnFocus);

    return () => {
      canceled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", CheckOnFocus);
    };
  }, []);

  return (
    <Banner
      message={versionStore.updateAvailable ? "A new version of this app is available." : undefined}
      inlineAction={
        <Button size="xs" variant="white" onClick={versionStore.Refresh}>
          Refresh
        </Button>
      }
    />
  );
});

export default UpdateBanner;
