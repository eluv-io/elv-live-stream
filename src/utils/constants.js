import GeneralPanel from "@/pages/stream-details/general/GeneralPanel";
import PlayoutPanel from "@/pages/stream-details/playout/PlayoutPanel";
import RecordingPanel from "@/pages/stream-details/recording/RecordingPanel";
import DetailsPanel from "@/pages/stream-details/details/DetailsPanel";

export const STATUS_MAP = {
  UNCONFIGURED: "unconfigured",
  UNINITIALIZED: "uninitialized",
  INITIALIZED: "initialized",
  INACTIVE: "inactive",
  STOPPED: "stopped",
  STARTING: "starting",
  RUNNING: "running",
  STALLED: "stalled",
  DEGRADED: "degraded"
};

export const DETAILS_TABS = [
  {label: "Details", value: "status", Component: DetailsPanel},
  {label: "General Config", value: "general", Component: GeneralPanel},
  {label: "Recording Config", value: "recording", Component: RecordingPanel},
  {label: "Playout Config", value: "playout", Component: PlayoutPanel}
];

export const DEFAULT_WATERMARK_TEXT = {
  "font_color": "white@0.5",
  "font_relative_height": 0.05,
  "shadow": true,
  "shadow_color": "black@0.5",
  "template": "PREPARED FOR $USERNAME - DO NOT DISTRIBUTE",
  "x": "(w-tw)/2",
  "y": "h-(4*lh)"
};

export const DEFAULT_WATERMARK_FORENSIC = {
  "algo": 6,
  "forensic_duration": 0,
  "forensic_start": "",
  "image_a": "",
  "image_b": "",
  "is_stub": true,
  "payload_bit_nb": 23,
  "wm_enabled": true
};

export const DRM_MAP = {
  ALL: ["hls-sample-aes", "hls-aes128", "hls-fairplay", "hls-widevine-cenc", "hls-playready-cenc"],
  PUBLIC: ["hls-sample-aes", "hls-aes128"],
  FAIRPLAY: ["hls-fairplay"],
  CLEAR: ["hls-clear"],
  HLS_WIDEVINE: ["hls-widevine-cenc"],
  PLAYREADY: ["hls-playready-cenc"]
};

export const ENCRYPTION_OPTIONS = [
  {value: "drm-public", label: "DRM - Public Access", title: "Playout Formats - HLS Sample AES, HLS AES-128", format: DRM_MAP.PUBLIC, id: "drm-public"},
  {value: "drm-all", label: "DRM - All Formats", title: "Playout Formats - HLS Sample AES, HLS AES-128, HLS Fairplay", format: DRM_MAP.ALL, id: "drm-all"},
  {value: "drm-fairplay", label: "DRM - Fairplay", title: "Playout Formats - HLS Fairplay", format: DRM_MAP.FAIRPLAY, id: "drm-fairplay"},
  {value: "drm-widevine", label: "DRM - HLS Widevine", title: "Playout Formats - HLS Widevine", format: DRM_MAP.HLS_WIDEVINE, id: "drm-widevine"},
  {value: "drm-playready", label: "DRM - HLS PlayReady", title: "Playout Formats - HLS PlayReady", format: DRM_MAP.PLAYREADY, id: "drm-playready"},
  {value: "clear", label: "Clear", title: "Playout Formats - HLS Clear", format: DRM_MAP.CLEAR, id: "clear"}
];

export const QUALITY_MAP = {
  DEGRADED: "degraded",
  SEVERE: "severe",
  GOOD: "good"
};

export const RECORDING_BITRATE_OPTIONS = [
  {label: "512 Kbps", value: 512000},
  {label: "384 Kbps", value: 384000},
  {label: "256 Kbps", value: 256000},
  {label: "192 Kbps", value: 192000},
  {label: "128 Kbps", value: 128000},
  {label: "48 Kbps", value: 48000}
];

export const RETENTION_OPTIONS = [
  {label: "1 Hour", value: 3600}, // 60 * 60 = 3600 seconds
  {label: "6 Hours", value: 21600}, // 60 * 60 * 6 = 21600
  {label: "1 Day", value: 86400}, // 60 * 60 * 24 = 86400 seconds
  {label: "1 Week", value: 604800}, // 60 * 60 * 24 * 7 = 604800 seconds
  {label: "1 Month", value: 2635200} // 60 * 60 * 24 * 30.5 = 2635200 seconds
];

export const DVR_DURATION_OPTIONS = [
  {label: "10 Minutes", value: 600},
  {label: "30 Minutes", value: 1800},
  {label: "1 Hour", value: 3600},
  {label: "2 Hours", value: 7200},
  {label: "4 Hours", value: 14400}
];

export const CONNECTION_TIMEOUT_OPTIONS = [
  {label: "10 Minutes", value: 600},
  {label: "30 Minutes", value: 1800},
  {label: "1 Hour", value: 3600},
  {label: "4 Hours", value: 14400}
];

export const RECONNECTION_TIMEOUT_OPTIONS = [
  {label: "No Reconnection", value: -1},
  {label: "10 Minutes", value: 600},
  {label: "30 Minutes", value: 1800},
  {label: "1 Hour", value: 3600},
  {label: "4 Hours", value: 14400}
];

// Human-readable text

export const STATUS_TEXT = {
  unconfigured: "Not Configured",
  uninitialized: "Uninitialized",
  initialized: "Initialized",
  inactive: "Inactive",
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stalled: "Stalled",
  terminating: "Terminating"
};

export const FORMAT_TEXT = {
  udp: "MPEGTS",
  srt: "SRT",
  "srt-caller": "SRT Caller",
  rtmp: "RTMP"
};

export const CODEC_TEXT = {
  h264: "H.264",
  h265: "H.265",
  mpeg2video: "MPEG-2"
};

export const RECORDING_STATUS_TEXT = {
  EXPIRED: "Expired",
  PARTIALLY_AVAILABLE: "Partially Available",
  AVAILABLE: "Available"
};

export const QUALITY_TEXT = {
  "good": "Good",
  "severe": "Severe",
  "degraded": "Degraded"
};

export const AudioCodec = (value) => {
  if(value === "aac") {
    return "aac";
  } else if(value === "mp3") {
    return "mp3";
  } else if(value === "mp2") {
    return "mp2";
  } else if(value?.includes("mp4a")) {
    return "mp4a";
  } else {
    return "--";
  }
};

export const RETENTION_TEXT = {
  3600: "1 Hour",
  21600: "6 Hours",
  86400: "1 Day",
  604800: "1 Week",
  2635200: "1 Month"
};
