import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {InitializeEluvioPlayer, EluvioPlayerParameters} from "@eluvio/elv-player-js/lib/index.js";

import {rootStore} from "@/stores/index.js";
import {Box} from "@mantine/core";

const Video = observer(({
  objectId,
  className,
  clientOptions={},
  sourceOptions={},
  playoutParameters={},
  playerOptions={}
}) => {
  const [player, setPlayer] = useState(undefined);

  useEffect(() => {
    return () => player?.Destroy();
  }, [player]);

  if(!objectId) {
    // eslint-disable-next-line no-console
    console.warn("Unable to determine playout hash for video");
    return null;
  }

  return (
    <Box w="100%" h="100%" className={className}>
      <div
        ref={element => {
          if(!element || player) { return; }

          InitializeEluvioPlayer(
            element,
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
                // playerProfile: EluvioPlayerParameters.playerProfile.LOW_LATENCY,
                ...playerOptions
              }
            }
          ).then(newPlayer => setPlayer(newPlayer));
        }}
      />
    </Box>
  );
});

export default Video;
