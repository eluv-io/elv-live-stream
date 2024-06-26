import DetailsPanel from "Pages/stream-details/details/DetailsPanel";
import PlayoutPanel from "Pages/stream-details/playout/PlayoutPanel";
import AudioPanel from "Pages/stream-details/audio/AudioPanel";

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
  {label: "Details", value: "details", Component: DetailsPanel},
  {label: "Playout", value: "playout", Component: PlayoutPanel},
  {label: "Audio", value: "audio", Component: AudioPanel}
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

export const DRM_MAP = {
  ALL: ["hls-sample-aes", "hls-aes128", "hls-fairplay"],
  PUBLIC: ["hls-sample-aes", "hls-aes128"],
  FAIRPLAY: ["hls-fairplay"],
  CLEAR: ["hls-clear"]
};

export const ENCRYPTION_OPTIONS = [
  {value: "drm-public", label: "DRM - Public Access", title: "Playout Formats - HLS Sample AES, HLS AES-128", format: DRM_MAP.PUBLIC, id: "drm-public"},
  {value: "drm-all", label: "DRM - All Formats", title: "Playout Formats - HLS Sample AES, HLS AES-128, HLS Fairplay", format: DRM_MAP.ALL, id: "drm-all"},
  {value: "drm-fairplay", label: "DRM - Fairplay", title: "Playout Formats - HLS Fairplay", format: DRM_MAP.FAIRPLAY, id: "drm-fairplay"},
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
