export const STATUS_MAP = {
  UNCONFIGURED: "unconfigured",
  UNINITIALIZED: "uninitialized",
  INITIALIZED: "initialized",
  INACTIVE: "inactive",
  STOPPED: "stopped",
  STARTING: "starting",
  RUNNING: "running",
  STALLED: "stalled",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable"
};

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

export const DEFAULT_WATERMARK_IMAGE = {
  "align_h": "right",
  "align_v": "top",
  "image": "PATH_TO_IMAGE",
  "wm_enabled": true
};

export const PLAYOUT_FORMAT_OPTIONS = [
  {value: "hls-clear", label: "HLS Clear"},
  {value: "hls-aes128", label: "HLS AES-128"},
  {value: "hls-sample-aes", label: "HLS Sample AES"},
  {value: "hls-fairplay", label: "HLS Fairplay"},
  {value: "hls-widevine-cenc", label: "HLS Widevine"},
  {value: "hls-playready-cenc", label: "HLS PlayReady"},
  {value: "dash-clear", label: "Dash Clear"},
  {value: "dash-widevine", label: "Dash Widevine"},
  // {value: "dash-playready-cenc", label: "Dash PlayReady"},
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
  {label: "1 Hour", value: "3600"}, // 60 * 60 = 3600 seconds
  {label: "6 Hours", value: "21600"}, // 60 * 60 * 6 = 21600
  {label: "1 Day", value: "86400"}, // 60 * 60 * 24 = 86400 seconds
  {label: "1 Week", value: "604800"}, // 60 * 60 * 24 * 7 = 604800 seconds
  {label: "1 Month", value: "2635200"}, // 60 * 60 * 24 * 30.5 = 2635200 seconds
  // {label: "Indefinitely", value: "indefinite"}
];

export const DVR_DURATION_OPTIONS = [
  {label: "10 Minutes", value: "600"},
  {label: "30 Minutes", value: "1800"},
  {label: "1 Hour", value: "3600"},
  {label: "2 Hours", value: "7200"},
  {label: "4 Hours", value: "14400"}
];

export const CONNECTION_TIMEOUT_OPTIONS = [
  {label: "10 Minutes", value: "600"},
  {label: "30 Minutes", value: "1800"},
  {label: "1 Hour", value: "3600"},
  {label: "4 Hours", value: "14400"}
];

export const RECONNECTION_TIMEOUT_OPTIONS = [
  {label: "No Reconnection", value: "-1"},
  {label: "10 Minutes", value: "600"},
  {label: "30 Minutes", value: "1800"},
  {label: "1 Hour", value: "3600"},
  {label: "4 Hours", value: "14400"}
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
  terminating: "Terminating",
  unavailable: "Temporarily Unavailable"
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

export const COLOR_MAP = {
  srt: "elv-blue-gray.1",
  rtp: "elv-violet.0",
  ts: "elv-green.0",
  fmp4: "elv-orange.0"
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

export const FABRIC_NODE_REGIONS = [
  {value: "na-east-north", label: "NA Northeast"},
  {value: "na-east-south", label: "NA Southeast"},
  {value: "na-west-north", label: "NA Northwest"},
  {value: "na-west-south", label: "NA Southwest"},
  {value: "eu-east-north", label: "EU Northeast"},
  {value: "eu-east-south", label: "EU Southeast"},
  {value: "eu-west-north", label: "EU Northwest"},
  {value: "eu-west-south", label: "EU Southwest"},
  {value: "as-east", label: "AS East"},
  {value: "au-east", label: "AU East"},
];
