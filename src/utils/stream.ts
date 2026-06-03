import {PlayoutFormat, STATUS_MAP, StreamStatus} from "@/utils/constants";
import {toJS} from "mobx";

// TYPES
export interface ForensicWatermark {
  algo: number;
  forensic_duration: number;
  forensic_start: string;
  image_a: string;
  image_b: string;
  is_stub: boolean;
  payload_bit_nb: number;
  wm_enabled: boolean;
}

export interface ImageWatermark {
  align_h: string;
  align_v: string;
  image: string;
  margin_h: string;
  margin_v: string;
  target_video_height: number;
  wm_enabled: boolean;
}

export interface SimpleWatermark {
  font_color: string;
  font_relative_height: number;
  shadow: boolean;
  template: string;
  timecode: string;
  timecode_rate: number;
  x: string;
  y: string;
}

interface RecordingInputCfg {
  bypass_libav_reader?: boolean;
  copy_mode?: string;
  copy_packaging?: "raw_ts" | "rtp_ts";
  custom_read_loop_enabled?: boolean;
  input_packaging?: string;
}

interface RecordingConfig {
  part_ttl?: number;
  connection_timeout?: number;
  reconnect_timeout?: number;
  copy_mpegts?: boolean;
  input_cfg?: RecordingInputCfg;
  persistent?: boolean;
}

interface ProfileSimpleWatermark {
  font_color?: string;
  font_relative_height?: number;
  shadow?: boolean;
  shadow_color?: string;
  template?: string;
  x?: string;
  y?: string;
}

interface ProfileImageWatermark {
  align_h?: string;
  align_v?: string;
  image?: string;
  wm_enabled?: boolean;
}

interface LadderAudioSpec {
  bit_rate?: number;
  channels?: number;
  codecs?: string;
}

interface LadderVideoSpec {
  bit_rate?: number;
  codecs?: string;
  height?: number;
  width?: number;
}

interface PlayoutConfig {
  dvr?: boolean;
  forensic_watermark?: ForensicWatermark;
  image_watermark?: ProfileImageWatermark;
  ladder_specs?: { audio?: LadderAudioSpec[]; video?: LadderVideoSpec[] };
  playout_formats?: PlayoutFormat[];
  simple_watermark?: ProfileSimpleWatermark;
}

interface AudioStreamConfig {
  bitrate?: number;
  codec?: string;
  playout?: boolean;
  playout_label?: string;
  record?: boolean;
  recording_bitrate?: number;
  recording_channels?: number;
}

interface XcParams {
  audio_bitrate?: number;
  audio_index?: Record<string, number>;
  audio_seg_duration_ts?: number;
  connection_timeout?: number;
  copy_mpegts?: boolean;
  ecodec2?: string;
  enc_height?: number;
  enc_width?: number;
  filter_descriptor?: string;
  force_keyint?: number;
  format?: string;
  listen?: boolean;
  n_audio?: number;
  preset?: string;
  sample_rate?: number;
  seg_duration?: string;
  skip_decoding?: boolean;
  start_segment_str?: string;
  stream_id?: number;
  sync_audio_to_stream_id?: number;
  video_bitrate?: number;
  video_frame_duration_ts?: number | null;
  video_seg_duration_ts?: number;
  video_time_base?: string | null;
  xc_type?: number;
}

export interface LiveRecordingConfigProfile {
  name?: string;
  recording_config?: RecordingConfig;
  playout_config?: PlayoutConfig;
  recording_stream_config?: { audio?: Record<string, AudioStreamConfig> };
  input_stream_info?: Record<string, unknown>;
  recording_params?: { xc_params?: XcParams };
  probe_info?: Record<string, unknown>;
}

export interface AudioTrackFormEntry {
  bitrate: number;
  codec: string;
  record: boolean;
  recording_bitrate: number;
  recording_channels: number;
  playout: boolean;
  playout_label: string;
  lang?: string;
  default: boolean;
}

interface ParseLiveConfigDataProps {
  audioFormData?: Record<string, AudioTrackFormEntry>;
  configProfile?: LiveRecordingConfigProfile;
  connectionTimeout?: number | string;
  copyMode?: "raw_ts" | "raw_only";
  copyMpegTs?: boolean;
  customReadLoop?: boolean;
  dvrEnabled?: boolean;
  dvrMaxDuration?: number | string;
  dvrStartTime?: string;
  encryption: PlayoutFormat[];
  forensicWatermark?: ForensicWatermark;
  imageWatermark?: ImageWatermark;
  inputPackaging?: "raw_ts" | "rtp_ts";
  persistent: boolean;
  reconnectionTimeout?: number;
  retention?: number | string;
  simpleWatermark?: SimpleWatermark;
  skipDvrSection?: boolean;
}

// FUNCTIONS

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
}: ParseLiveConfigDataProps): LiveRecordingConfigProfile => {
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
    ...(dvrEnabled && dvrMaxDuration != null ? {dvr_max_duration: parseInt(String(dvrMaxDuration))} : {})
  } : undefined;

  return {
    recording_config: {
      connection_timeout: connectionTimeout !== undefined ? parseInt(String(connectionTimeout)) : undefined,
      copy_mpegts: copyMpegTs,
      input_cfg: inputCfg,
      part_ttl: retention !== undefined ? parseInt(String(retention)) : undefined,
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

export const StreamIsActive = (state: StreamStatus) : boolean => {
  let active = false;

  if(([STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED, STATUS_MAP.STOPPED] as StreamStatus[]).includes(state)) {
    active = true;
  }

  return active;
};

export const StatusColor = (status: StreamStatus): "elv-orange.6" | "elv-green.5" | "elv-red.4" | "elv-yellow.6" | "" => {
  if(status === STATUS_MAP.STOPPED) {
    return "elv-orange.6";
  } else if(status === STATUS_MAP.RUNNING) {
    return "elv-green.5";
  } else if(([STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED, STATUS_MAP.STALLED] as StreamStatus[]).includes(status)) {
    return "elv-red.4";
  } else if(status === STATUS_MAP.DEGRADED) {
    return "elv-yellow.6";
  }

  return "";
};

export const DeriveSourceAndPackaging = ({url, inputCfg}: {url: string, inputCfg: RecordingInputCfg}): {source: ("srt" | "ts" | "rtp" | "rtmp")[] | undefined, packaging: ("rtp" | "ts" | "fmp4")[]} => {
  const protocol = url?.match(/^(\w+):\/\//)?.[1];
  const copyMode = inputCfg?.copy_mode;
  const copyPackaging = inputCfg?.copy_packaging;

  const packaging = [];
  let source: ("srt" | "ts" | "rtp" | "rtmp")[] | undefined;

  if(copyPackaging === "rtp_ts") { packaging.push("rtp"); }
  if(copyMode === "raw") { packaging.push("ts"); }
  else if(copyMode === "raw_only") { packaging.push("ts"); }
  if(copyMode !== "raw_only") { packaging.push("fmp4"); }

  switch(protocol) {
    case "srt":
      source = ["srt", "ts"];
      break;
    case "udp": source = ["ts"]; break;
    case "rtp": source = ["rtp", "ts"]; break;
    case "rtmp": source = ["rtmp"]; break;
  }

  return {source, packaging};
};

