import {AV_STREAM, STATUS_MAP} from "Data/StreamData";
import Fraction from "fraction.js";

export const ParseLiveConfigData = ({
  inputFormData,
  outputFormData,
  url,
  referenceUrl,
  encryption,
  avProperties,
  retention
}) => {
  const {audioStreamIndex} = inputFormData;
  const {audioChannelLayout, audioBitrate} = outputFormData;

  const config = {
    drm: encryption.includes("drm") ? "drm" : "clear",
    drm_type: encryption,
    input: {
      audio: {
        stream: AV_STREAM[avProperties],
        stream_index: parseInt(audioStreamIndex)
      }
    },
    output: {
      audio: {
        bitrate: parseInt(audioBitrate),
        channel_layout: parseInt(audioChannelLayout),
        quality: AV_STREAM[avProperties]
      }
    },
    part_ttl: parseInt(retention),
    url,
    reference_url: referenceUrl
  };

  return config;
};

export const Slugify = (string) => {
  return (string || "")
    .toLowerCase()
    .trim()
    .replace(/ /g, "-")
    .replace(/[^a-z0-9\-]/g,"")
    .replace(/-+/g, "-");
};

export const VideoBitrateReadable = (bitrate) => {
  if(!bitrate) { return ""; }
  const denominator = 1000000;
  let value = (bitrate / denominator).toFixed(1);

  return `${value}Mbps`;
};

export const StreamIsActive = (state) => {
  let active = false;

  if([STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED, STATUS_MAP.STOPPED].includes(state)) {
    active = true;
  }

  return active;
};

export const StatusIndicator = (status) => {
  if(status === STATUS_MAP.STOPPED) {
    return "elv-orange.6";
  } else if(status === STATUS_MAP.RUNNING) {
    return "elv-green.5";
  } else if([STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNINITIALIZED, STATUS_MAP.STALLED].includes(status)) {
    return "elv-red.4";
  } else if(status === STATUS_MAP.DEGRADED) {
    return "elv-yellow.6";
  }
};

export const FormatTime = ({milliseconds, format="hh:mm"}) => {
  if(!milliseconds) { return ""; }

  const hours = new Fraction(milliseconds, 1000)
    .div(3600)
    .mod(24)
    .floor(0)
    .toString();
  const minutes = new Fraction(milliseconds, 1000)
    .div(60)
    .mod(60)
    .floor(0)
    .toString();
  const seconds = new Fraction(milliseconds, 1000)
    .mod(60)
    .floor(0)
    .toString();

  let timeString = `${hours}h ${minutes}min`;

  if(format === "hh:mm:ss") {
    const arrayValue = [
      hours.padStart(2, "0"),
      minutes.padStart(2, "0"),
      seconds.padStart(2, "0")
    ];

    timeString = arrayValue.join(":");
    // timeString = `${hours}h ${minutes}min ${seconds}sec`
  } else if(format === "hh:mm") {
    timeString = `${hours}h ${minutes}min`;
  }

  return timeString;
};

// Convert a FileList to file info
export const FileInfo = async ({path, fileList}) => {
  return Promise.all(
    Array.from(fileList).map(async file => {
      const data = file;
      const filePath = file.webkitRelativePath || file.name;
      return {
        path: `${path}${filePath}`.replace(/^\/+/g, ""),
        type: "file",
        size: file.size,
        mime_type: file.type,
        data
      };
    })
  );
};

export const Pluralize = ({base, suffix="s", count}) => {
  return `${count} ${base}${count > 1 ? suffix : ""}`;
};