import React, {useEffect, useState} from "react";
import EluvioPlayer, {EluvioPlayerParameters} from "@eluvio/elv-player-js";
import {rootStore} from "../stores";
import {observer} from "mobx-react";

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
    <div className={`player-container ${player ? "player-container--loaded" : "player-container--loading"} ${className}`}>
      <div
        className="player-container__player"
        ref={element => {
          if(!element || player) { return; }

          setPlayer(
            new EluvioPlayer(
              element,
              {
                clientOptions: {
                  client,
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
                  playerProfile: EluvioPlayerParameters.playerProfile.LOW_LATENCY,
                  ...playerOptions
                }
              }
            )
          );
        }}
      />
    </div>
  );
});

export default Video;
