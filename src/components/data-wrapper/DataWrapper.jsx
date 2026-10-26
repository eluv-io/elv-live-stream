import {useEffect, useRef} from "react";
import {useLocation} from "react-router-dom";
import {outputStore, streamStatusStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";

// Pages that skip the stream status poll. Outputs shows input.status from its last OutputsList load instead.
const NO_STREAM_STATUS_PATHS = /^\/(outputs(\/[^/]+)?|settings)\/?$/;
// Pages that skip the output state poll.
const NO_OUTPUT_STATE_PATHS = /^\/settings\/?$/;

const DataWrapper = observer(({children}) => {
  const {pathname} = useLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {

    let canceled = false;
    let timeoutId;

    // LoadAllOutputsState (not LoadOutputs) is used here on purpose: it refreshes
    // each output's live state independently and merges it, mirroring
    // LoadAllStreamsStatus. LoadOutputs is a single all-or-nothing OutputsList call —
    // one thrown step leaves every output's connected_clients stale, which is why
    // the timer-driven refresh stopped updating while the initial load was fine.
    // The full list/config reload still happens on page mount and manual refresh.
    const Poll = async () => {
      if(!NO_STREAM_STATUS_PATHS.test(pathnameRef.current)) {
        try {
          await streamStatusStore.LoadAllStreamsStatus();
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error("Unable to get stream status.", error);
        }
      }

      if(!NO_OUTPUT_STATE_PATHS.test(pathnameRef.current)) {
        try {
          await outputStore.LoadAllOutputsState();
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error("Unable to get output state.", error);
        }
      }
    };

    // Recursive setTimeout, not setInterval: schedule the next poll only AFTER
    // the current one finishes. A full poll can exceed 60s, and setInterval
    // would stack a second poll onto the first.
    const Schedule = async () => {
      await Poll();
      if(!canceled) {
        timeoutId = setTimeout(Schedule, 60000);
      }
    };

    void Schedule();

    return () => {
      canceled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return children;
});

export default DataWrapper;
