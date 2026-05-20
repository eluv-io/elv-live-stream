import {STATUS_MAP} from "@/utils/constants";
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

export const StreamIsActive = (state) => {
  let active = false;

  if([STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED, STATUS_MAP.STOPPED].includes(state)) {
    active = true;
  }

  return active;
};

export const StatusColor = (status) => {
  if(status === STATUS_MAP.STOPPED) {
    return "elv-orange.6";
  } else if(status === STATUS_MAP.RUNNING) {
    return "elv-green.5";
  } else if([STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED, STATUS_MAP.STALLED].includes(status)) {
    return "elv-red.4";
  } else if(status === STATUS_MAP.DEGRADED) {
    return "elv-yellow.6";
  }
};

export const DeriveSourceAndPackaging = ({url, inputCfg}) => {
  const protocol = url?.match(/^(\w+):\/\//)?.[1];
  const copyMode = inputCfg?.copy_mode;
  const copyPackaging = inputCfg?.copy_packaging;

  const packaging = [];
  let source;

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
