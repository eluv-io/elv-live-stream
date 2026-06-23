import {useEffect} from "react";
import {outputStore, streamStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";

const DataWrapper = observer(({children}) => {
  useEffect(() => {

    // Stream status and the outputs list are polled together, and MUST run
    // sequentially — never concurrently. OutputsList (inside LoadOutputs)
    // temporarily reroutes the shared client to a live-egress node via
    // RouteToLiveEgress; any stream-status read in flight during that window
    // gets routed to the egress node and 403s ("token/auth not authorized").
    // Awaiting status before outputs keeps the two off the wire at once.
    // Staggered intervals don't fix this: AllStreamsStatus can run for several
    // seconds, so independent timers still overlap.
    const Poll = async () => {
      try {
        await streamStore.AllStreamsStatus();
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to get stream status.", error);
      }

      try {
        await outputStore.LoadOutputs();
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to get outputs.", error);
      }
    };

    void Poll();

    let intervalId = setInterval(() => {
      void Poll();
    }, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return children;
});

export default DataWrapper;
