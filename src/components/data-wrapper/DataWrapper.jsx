import {useEffect} from "react";
import {outputStore, streamStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";

const DataWrapper = observer(({children}) => {
  useEffect(() => {

    let canceled = false;
    let timeoutId;

    // Stream status and the outputs list are polled together, and MUST run
    // sequentially — never concurrently. OutputsList (inside LoadOutputs)
    // temporarily reroutes the shared client to a live-egress node via
    // RouteToLiveEgress / SetNodes; any read in flight during that window gets
    // routed to the wrong node (stream-status reads 403; the per-output state
    // fetch fails and resets state to {}, so connected_clients drops to 0).
    // Awaiting status before outputs keeps the two off the wire at once.
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

    // Recursive setTimeout, not setInterval: schedule the next poll only AFTER
    // the current one finishes. A full poll can exceed 60s (status over every
    // stream + per-node output state fetches); setInterval would fire a second
    // poll into the first, and the overlapping client reroutes corrupt each
    // other's reads — which is why the timer-driven refresh dropped the client
    // count while a manual (isolated) refresh worked.
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
