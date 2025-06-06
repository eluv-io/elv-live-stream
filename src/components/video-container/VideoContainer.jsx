import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {streamStore} from "@/stores/index.js";
import {ActionIcon, AspectRatio, Box} from "@mantine/core";
import {PlayCircleIcon as PlayIcon} from "@/assets/icons/index.js";
import Video from "@/components/video/Video.jsx";
import {IconX} from "@tabler/icons-react";
import styles from "./VideoContainer.module.css";

const VideoContent = observer(({allowClose, setPlay, slug, borderRadius}) => {
  return (
    <>
      <Box pos="absolute" inset={0} style={{borderRadius}}>
        {
          allowClose &&
          <ActionIcon
            className={styles.closeButton}
            title="Stop Playback"
            color="gray.1"
            variant="transparent"
            pos="absolute"
            onClick={() => setPlay(false)}
          >
            <IconX color="white" />
          </ActionIcon>
        }
      </Box>
      <Video
        objectId={streamStore.streams[slug].objectId}
        playerOptions={{
          capLevelToPlayerSize: false,
          autoplay: true
        }}
      />
    </>
  );
});

const PlaceholderContent = observer(({
  setPlay,
  showPreview,
  frameSegmentUrl,
  status,
  playable=true,
  borderRadius
}) => {
  return (
    <button
      role="button"
      tabIndex={1}
      onClick={() => setPlay(true)}
      className={styles.videoPlaceholder}
      style={{borderRadius}}
      disabled={!playable}
    >
      {
        status === "running" &&
        <PlayIcon width={45} height={45} color="white" style={{zIndex: 10}}/>
      }
      {
        (!showPreview || !frameSegmentUrl) ? null :
          (
            <video
              src={frameSegmentUrl}
              className={`${styles.videoFrame} ${borderRadius === 16 ? styles.videoFrame16Radius : ""}`}
              controls={false}
              onContextMenu={e => e.preventDefault()}
              onError={event => {
                // eslint-disable-next-line no-console
                console.warn("Failed to load frame segment URL", event?.target?.error || event);
              }}
            />
          )
      }
    </button>
  );
});

export const VideoContainer = observer(({
  slug,
  index,
  showPreview,
  allowClose = true,
  playable=false,
  borderRadius=11
}) => {
  const [play, setPlay] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [frameSegmentUrl, setFrameSegmentUrl] = useState(streamStore.streamFrameUrls[slug]?.url);
  const status = streamStore.streams?.[slug]?.status;

  useEffect(() => {
    if(!showPreview || play || status !== "running") {
      return;
    }

    const existingFrame = streamStore.streamFrameUrls[slug];
    // Frame loading already initialized - no delay needed
    if(frameKey > 0 || (existingFrame && Date.now() - existingFrame.timestamp < 60000)) {
      setFrameSegmentUrl(existingFrame.url);
      // eslint-disable-next-line no-console
      console.log("SKIP DELAY", slug);
      return;
    }

    // Stagger frame loads
    const delay = Math.min(200 + 500 * index, 10000);
    const frameTimeout = setTimeout(async () => {
      setFrameSegmentUrl(await streamStore.StreamFrameURL(slug));
    }, delay);

    return () => clearTimeout(frameTimeout);
  }, [play, frameKey, status, showPreview]);

  // Reload frame every minute after initial frame load
  useEffect(() => {
    if(!frameSegmentUrl) { return; }

    const delay = 60000 + Math.min(200 + 500 * index, 10000);

    const updateTimeout = setTimeout(() => setFrameKey(frameKey + 1), delay);

    return () => clearTimeout(updateTimeout);
  }, [frameKey, frameSegmentUrl]);

  useEffect(() => {
    // If playable status changes and video is playing, stop play
    if(playable === false && play) {
      setPlay(false);
    }
  }, [playable]);

  return (
    <Box className={styles.videoWrapper} style={{borderRadius}}>
      <AspectRatio ratio={16 / 9} mx="auto" pos="relative" h="100%" className={styles.aspectRatio}>
        {
          play ?
            <VideoContent
              setPlay={setPlay}
              slug={slug}
              allowClose={allowClose}
              borderRadius={borderRadius}
            /> :
            <PlaceholderContent
              playable={playable}
              setPlay={setPlay}
              status={status}
              showPreview={showPreview}
              frameSegmentUrl={frameSegmentUrl}
              borderRadius={borderRadius}
            />
        }
      </AspectRatio>
    </Box>
  );
});

export default VideoContainer;
