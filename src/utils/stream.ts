import {PlayoutFormat, STATUS_MAP, StreamStatus} from "@/utils/constants";
import {toJS} from "mobx";

// TYPES
export interface PublishingVideo {
  bit_rate: number;
  frame_rate: string;
  resolution: string;
  codec: string;
}

export interface PublishingAudio {
  sample_rate: number;
}

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
  align_h?: string;
  align_v?: string;
  image?: string;
  margin_h?: string;
  margin_v?: string;
  target_video_height?: number;
  wm_enabled?: boolean;
}

export interface SimpleWatermark {
  font_color?: string;
  font_relative_height?: number;
  shadow?: boolean;
  template?: string;
  timecode?: string;
  timecode_rate?: number;
  x?: string;
  y?: string;
}

export interface RecordingInputCfg {
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

export interface RecordingPeriod {
  id: number;
  audio_mez_duration_ts: number;
  audio_sample_rate: number;
  audio_timescale: number;
  cues: {
    list: any[];
    trimmed: number;
  };
  current_parts: Record<string, {
    qlhash: string;
    qlhash_next: string;
    qpwt: string;
    qpwt_next: string;
  }>;
  end_time: string;
  end_time_epoch_sec: number;
  finalized_parts_info: Record<string, {
    last_finalization_time: number;
    n_parts: number;
  }>;
  last_update_time: string;
  last_update_time_epoch_sec: number;
  live_recording_handle: string;
  sources: Record<string, {
    name: string;
    trimmed: number;
    type: number;
    parts: Array<{
      close_time: number;
      creation_time: number;
      finalization_time: number;
      first_write_time: number;
      hash: string;
      last_write_time: number;
      open_time: number;
      size: number;
    }>;
  }>;
  start_time: string;
  start_time_epoch_sec: number;
  video_mez_duration_ts: number;
  video_timescale: number;
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

export interface LadderSpec {
  bit_rate: number;
  codecs: string;
  media_type: number;
  representation: string;
  stream_index: number;
  stream_name: string;
  // video-only
  height?: number;
  width?: number;
  // audio-only
  channels?: number;
  default?: boolean;
  stream_label?: string;
  lang?: string;
}

// Raw fabric metadata shape — written to/read from the content object
interface PlayoutConfig {
  dvr?: boolean;
  forensic_watermark?: ForensicWatermark;
  image_watermark?: ImageWatermark;
  ladder_specs?: { audio?: LadderAudioSpec[]; video?: LadderVideoSpec[] };
  playout_formats?: PlayoutFormat[];
  simple_watermark?: SimpleWatermark;
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

export interface FinalizeContentObjectResponse {
  objectId: string;
  hash: string;
  object_id: string;
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

export interface StreamRecord {
  objectId: string;
  slug: string;
}

export interface StreamMetadata {
  objectId: string;
  slug: string;
  inputCfg: RecordingInputCfg | undefined;
  // Stream Table Details
  audioStreamCount: number | undefined;
  codecName: string;
  packaging: StreamPackaging[];
  source: StreamSource[] | undefined;
  videoBitrate: number;
  // General Config
  configProfile: string;
  description: string;
  display_title: string;
  originUrl: string;
  referenceUrl: string;
  title: string;
  // Recording Config
  connectionTimeout: string | null;
  partTtl: string | null;
  persistent: boolean;
  reconnectionTimeout: string | null;
  // Playout Config
  drm: PlayoutFormat[];
  dvrEnabled: boolean;
  dvrMaxDuration: string | number | null;
  dvrStartTime: string;
  forensicWatermark: ForensicWatermark;
  imageWatermark: ImageWatermark;
  simpleWatermark: SimpleWatermark;
  watermarkType: string;
  // Other Details
  egressEnabled: boolean;
  profileLastUpdated: string;
  videoStreamProbe: ProbeStream[];
  publishingVideo: PublishingVideo;
  publishingAudio: PublishingAudio;
  sourceInputStats: {
    packets_received: number;
    packets_dropped: number;
    packetsPercentage: number;
    seq_num_skip_tot: number;
    seq_num_skip_count: number;
  };
}

export interface ProbeStream {
  avg_frame_rate: string;
  bit_rate: number;
  channel_layout: number;
  codec_id: number;
  codec_name: string;
  codec_type: "video" | "audio";
  color_primaries: string;
  color_range: string;
  color_space: string;
  color_transfer: string;
  display_aspect_ratio: string;
  duration_ts: number;
  frame_rate: string;
  has_b_frame: boolean;
  level: number;
  pix_fmt: number;
  profile: number;
  sample_aspect_ratio: string;
  start_time: number;
  stream_id: number;
  stream_index: number;
  time_base: string;
  // video-only
  field_order?: string;
  height?: number;
  width?: number;
  // audio-only
  channels?: number;
  sample_rate?: number;
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

export type StreamSource = "srt" | "ts" | "rtp" | "rtmp";
export type StreamPackaging = "rtp" | "ts" | "fmp4";

export const DeriveSourceAndPackaging = ({url, inputCfg}: {url: string, inputCfg: RecordingInputCfg}): {source: StreamSource[] | undefined, packaging: StreamPackaging[]} => {
  const protocol = url?.match(/^(\w+):\/\//)?.[1];
  const copyMode = inputCfg?.copy_mode;
  const copyPackaging = inputCfg?.copy_packaging;

  const packaging: StreamPackaging[] = [];
  let source: StreamSource[] | undefined;

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

