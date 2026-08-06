import {useEffect, useRef} from "react";
import {observer} from "mobx-react-lite";
import {InitializeEluvioPlayer, EluvioPlayerParameters} from "@eluvio/elv-player-js/lib/index.js";

import {rootStore} from "@/stores/index.ts";
import {Box} from "@mantine/core";

const Video = observer(({
  objectId,
  className,
  clientOptions={},
  sourceOptions={},
  playoutParameters={},
  playerOptions={}
}) => {
  const targetRef = useRef(null);
  const playerRef = useRef(null);

  // Init in an effect (not a ref callback) so it's resilient to the async mount
  // caused by lazy-loading this component. The init is deferred a tick so that
  // StrictMode's dev-only mount→unmount→remount cancels this throwaway first
  // pass (via clearTimeout) BEFORE InitializeEluvioPlayer ever runs — otherwise
  // two players initialize on the same element and the discarded one leaves a
  // dead <video> as a black box over the live player. `canceled` additionally
  // tears down a player that resolves after unmount instead of orphaning it.
  useEffect(() => {
    if(!objectId) { return; }

    let canceled = false;

    const timeout = setTimeout(() => {
      if(!targetRef.current || playerRef.current) { return; }

      InitializeEluvioPlayer(
        targetRef.current,
        {
          clientOptions: {
            client: rootStore.client,
            network: EluvioPlayerParameters.networks[rootStore.networkInfo.name === "main" ? "MAIN" : "DEMO"],
            ...clientOptions
          },
          sourceOptions: {
            protocols: [EluvioPlayerParameters.protocols.HLS],
            ...sourceOptions,
            playoutParameters: {
              objectId,
              ...playoutParameters
            }
          },
          playerOptions: {
            watermark: EluvioPlayerParameters.watermark.OFF,
            muted: EluvioPlayerParameters.muted.ON,
            autoplay: EluvioPlayerParameters.autoplay.OFF,
            controls: EluvioPlayerParameters.controls.AUTO_HIDE,
            loop: EluvioPlayerParameters.loop.OFF,
            capLevelToPlayerSize: EluvioPlayerParameters.capLevelToPlayerSize.ON,
            // playerProfile: EluvioPlayerParameters.playerProfile.LOW_LATENCY,
            ...playerOptions
          }
        }
      ).then(newPlayer => {
        if(canceled) {
          newPlayer?.Destroy();
          return;
        }
        playerRef.current = newPlayer;
      });
    }, 0);

    return () => {
      canceled = true;
      clearTimeout(timeout);
      playerRef.current?.Destroy();
      playerRef.current = null;
    };
  }, [objectId]);

  if(!objectId) {
    // eslint-disable-next-line no-console
    console.warn("Unable to determine playout hash for video");
    return null;
  }

  return (
    <Box w="100%" h="100%" style={{borderRadius: "10px"}} className={className}>
      <div
        ref={targetRef}
        style={{borderRadius: "10px", overflow: "hidden"}}
      />
    </Box>
  );
});

export default Video;
