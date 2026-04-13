import {STATUS_MAP} from "@/utils/constants";
import Fraction from "fraction.js";
import {toJS} from "mobx";

export const ParseLiveConfigData = ({
  audioFormData,
  configProfile,
  connectionTimeout,
  copyMode,
  copyMpegTs,
  customReadLoop,
  dvrEnabled,
  dvrMaxDuration,
  dvrStartTime,
  encryption,
  forensicWatermark,
  imageWatermark,
  inputPackaging,
  persistent,
  reconnectionTimeout=600,
  retention,
  simpleWatermark,
  skipDvrSection=false
}) => {
  if(configProfile) {
    configProfile = toJS(configProfile);
    return {
      name: configProfile.name,
      recording_config: configProfile.recording_config ?? null,
      playout_config: configProfile.playout_config ?? null,
      recording_stream_config: audioFormData ? {audio: audioFormData} : (configProfile.recording_stream_config ?? null),
      input_stream_info: configProfile.input_stream_info ?? null,
      recording_params: configProfile.recording_params ?? null
    };
  }

  const inputCfg = copyMpegTs ? {
    bypass_libav_reader: true,
    copy_mode: copyMode,
    copy_packaging: inputPackaging,
    custom_read_loop_enabled: customReadLoop,
    input_packaging: inputPackaging
  } : copyMpegTs === false ? {} : undefined;

  const dvrConfig = !skipDvrSection && dvrEnabled !== undefined ? {
    dvr: dvrEnabled,
    ...(dvrEnabled && dvrStartTime != null ? {dvr_start_time: new Date(dvrStartTime).toISOString()} : {}),
    ...(dvrEnabled && dvrMaxDuration != null ? {dvr_max_duration: parseInt(dvrMaxDuration)} : {})
  } : undefined;

  return {
    recording_config: {
      connection_timeout: connectionTimeout !== undefined ? parseInt(connectionTimeout) : undefined,
      copy_mpegts: copyMpegTs,
      input_cfg: inputCfg,
      part_ttl: retention !== undefined ? parseInt(retention) : undefined,
      persistent,
      reconnect_timeout: reconnectionTimeout
    },
    playout_config: {
      ...dvrConfig,
      forensic_watermark: forensicWatermark,
      image_watermark: imageWatermark,
      playout_formats: encryption,
      simple_watermark: simpleWatermark
    },
    recording_stream_config: audioFormData ? {audio: audioFormData} : null
  };
};

export const Slugify = (string) => {
  return (string || "")
    .toLowerCase()
    .trim()
    .replace(/ /g, "-")
    .replace(/[^a-z0-9-]/g,"")
    .replace(/-+/g, "-");
};

export const VideoBitrateReadable = (bitrate) => {
  if(!bitrate) { return ""; }
  const denominator = 1000000;
  let value = (bitrate / denominator).toFixed(1);

  return `${value}Mbps`;
};

export const AudioBitrateReadable = (bitrate) => {
  if(!bitrate) { return ""; }
  const denominator = 1000;
  const value = (bitrate / denominator).toFixed(0);

  return `${value} Kbps`;
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

export const FormatTime = ({milliseconds, iso, format="hh,mm,ss"}) => {
  if(iso) {
    milliseconds = new Date(iso).getTime();
  }

  if(!milliseconds) { return ""; }

  const hours = new Fraction(milliseconds, 1000)
    .div(3600)
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
  } else if(format === "hh,mm") {
    timeString = `${hours}h ${minutes}min`;
  } else if(format === "hh,mm,ss") {
    timeString = `${hours}h ${minutes}min ${seconds}sec`;
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

export const SortTable = ({sortStatus, AdditionalCondition}) => {
  return (a, b) => {
    if(AdditionalCondition && typeof AdditionalCondition(a, b) !== "undefined") {
      return AdditionalCondition(a, b);
    }

    a = a[sortStatus.columnAccessor];
    b = b[sortStatus.columnAccessor];

    if(typeof a === "number" && typeof b === "number") {
      a = isNaN(a) ? 0 : a;
      b = isNaN(b) ? 0 : b;
    } else {
      a = typeof a === "string" ? a.trim().toLowerCase() : a ?? "";
      b = typeof b === "string" ? b.trim().toLowerCase() : b ?? "";
    }

    if(a === b) { return 0; }

    return (a < b ? -1 : 1) * (sortStatus.direction === "asc" ? 1 : -1);
  };
};

export const DateFormat = ({time, format="sec", options={}}) => {
  if(!["sec", "iso", "ms"].includes(format)) { throw Error("Invalid format type provided."); }

  if(format === "sec") {
    time = time * 1000;
  }

  return new Date(time).toLocaleString(navigator.language, options);
};

export const SanitizeUrl = ({url, removeQueryParams=[]}) => {
  if(!url) {
    return "";
  }

  try {
    const urlObject = new URL(url);
    urlObject.searchParams.delete("passphrase");
    removeQueryParams.forEach(param => {
      urlObject.searchParams.delete(param);
    });

    return urlObject.toString();
  } catch(_e) {
    // Fallback for URLs with out-of-range ports (e.g. rtp://) that new URL() rejects
    const paramsToRemove = ["passphrase", ...removeQueryParams];
    return paramsToRemove.reduce((acc, param) => {
      return acc.replace(new RegExp(`([?&])${param}=[^&]*(&?)`, "g"), (_, prefix, suffix) => {
        return suffix ? prefix : "";
      });
    }, url);
  }
};

const FallbackCopyToClipboard = ({text}) => {
  const element = document.createElement("textarea");
  element.value = text;
  element.style.all = "unset";
  // Avoid screen readers from reading text out loud
  element.ariaHidden = "true";
  // used to preserve spaces and line breaks
  element.style.whiteSpace = "pre";
  // do not inherit user-select (it may be `none`)
  element.style.webkitUserSelect = "text";
  element.style.MozUserSelect = "text";
  element.style.msUserSelect = "text";
  element.style.userSelect = "text";

  document.body.appendChild(element);
  element.focus();
  element.select();

  try {
    document.execCommand("copy");
    document.body.removeChild(element);
  } catch(error) {
    // eslint-disable-next-line no-console
    console.error("Unable to copy to clipboard", error);
  }
};

export const CopyToClipboard = ({text}) => {
  if(!navigator.clipboard) {
    FallbackCopyToClipboard({text});
    return;
  }

  navigator.clipboard.writeText(text)
    .catch(error => {
      if(error instanceof DOMException && error.name === "NotAllowedError") {
        FallbackCopyToClipboard({text});
      } else {
        // eslint-disable-next-line no-console
        console.error("Unable to copy to clipboard", error);
      }
    });
};

export const CheckExpiration = (date) => {
  if(typeof date !== "number") { return false; }

  const today = new Date();
  const inputDate = new Date(date);

  inputDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return inputDate < today;
};

// Recording Period helpers

export const MeetsDurationMin = ({startTime, endTime}) => {
  startTime = new Date(startTime).getTime();
  endTime = new Date(endTime).getTime();

  // If starting or currently running, part is copyable
  if(endTime === 0 || startTime === 0) { return true; }

  return (endTime - startTime) >= 61000;
};

export const IsWithinRetentionPeriod = ({startTime, persistent, retention}) => {
  const currentTimeMs = new Date().getTime();
  const startTimeMs = new Date(startTime).getTime();

  if(persistent) { return true; }

  const retentionMs = parseInt(retention || "") * 1000;

  if(typeof startTimeMs !== "number") { return false; }

  return (currentTimeMs - startTimeMs) < retentionMs;
};

export const RecordingPeriodIsExpired = ({
  parts=[],
  startTime,
  endTime,
  retention
}) => {
  const videoIsEmpty = parts.length === 0;

  if(
    videoIsEmpty ||
    !MeetsDurationMin({startTime, endTime}) ||
    !IsWithinRetentionPeriod({startTime, retention})
  ) {
    return true;
  } else {
    return false;
  }
};
