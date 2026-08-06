import {useEffect} from "react";
import {outputStore, streamStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";

const DataWrapper = observer(({children}) => {
  useEffect(() => {

    let canceled = false;
    let timeoutId;

    // Stream status and output state are polled together, and MUST run
    // sequentially — never concurrently. Both reroute the shared client to a
    // live-egress node (AllOutputsState -> OutputsState via RouteToLiveEgress /
    // SetNodes); any read in flight during that window gets routed to the wrong
    // node (stream-status reads 403; the per-output state fetch fails). Awaiting
    // status before output state keeps the two off the wire at once.
    //
    // AllOutputsState (not LoadOutputs) is used here on purpose: it refreshes
    // each output's live state independently and merges it, mirroring
    // AllStreamsStatus. LoadOutputs is a single all-or-nothing OutputsList call —
    // one thrown step leaves every output's connected_clients stale, which is why
    // the timer-driven refresh stopped updating while the initial load was fine.
    // The full list/config reload still happens on page mount and manual refresh.
    const Poll = async () => {
      try {
        await streamStore.AllStreamsStatus();
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to get stream status.", error);
      }

      try {
        await outputStore.AllOutputsState();
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to get output state.", error);
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
