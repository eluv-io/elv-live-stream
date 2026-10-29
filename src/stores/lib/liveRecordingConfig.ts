import {DeriveCopyMode, DeriveCopyPackaging, ProgramPidSelection, RecordingInputCfg} from "@/utils/stream/stream";
import {RESOLUTION_DIMENSIONS} from "@/utils/constants";
import {WithWriteToken} from "@/utils/fabric/withWriteToken";
import type {AudioDataMap} from "@/stores/streams/StreamDetailStore";

// Empty clears the value (null); anything else must be a positive integer
const ParseBitrate = (value: string | number, label: string): number | null => {
  if(typeof value === "string" && !value.trim()) { return null; }

  const bitrate = Number(value);
  if(!Number.isInteger(bitrate) || bitrate <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return bitrate;
};

export interface LiveRecordingConfigParams {
  libraryId?: string;
  objectId?: string;
  writeToken?: string;
  finalize?: boolean;
  retention?: string;
  persistent?: boolean;
  connectionTimeout?: string;
  reconnectionTimeout?: string;
  skipDvrSection?: boolean;
  dvrEnabled?: boolean;
  dvrStartTime?: number;
  dvrMaxDuration?: string;
  copyMpegTs?: boolean;
  fabricPackagingFMP4?: boolean;
  fabricPackagingMpegTs?: boolean;
  inputPackaging?: RecordingInputCfg;
  copyPackaging?: "raw_ts" | "rtp_ts";
  customReadLoop?: boolean;
  audioData?: AudioDataMap;
  multiPathEnabled?: boolean;
  copyPackagingFormats?: string[];
  alternateTranscodeEnabled?: boolean;
  alternateTranscodes?: string[];
  // Only used when objectId targets an alternate transcode's own object.
  resolution?: string;
  // Written to live_recording/recording_config/recording_params/xc_params.
  videoBitrate?: string | number;
  streamBitrate?: string | number;
  programPidSelection?: ProgramPidSelection;
  // Replaces live_recording_config/recording_params/xc_params; empty/null/undefined is a no-op.
  advancedEncodingParams?: Record<string, unknown> | null;
}

/** Merges the given fields into live_recording_config and mirrors them onto live_recording / live_recording_overrides; returns the write token. */
export const WriteLiveRecordingConfig = async ({
  client,
  libraryId,
  objectId,
  writeToken,
  finalize=true,
  retention,
  persistent,
  connectionTimeout,
  reconnectionTimeout,
  skipDvrSection=false,
  dvrEnabled,
  dvrStartTime,
  dvrMaxDuration,
  copyMpegTs,
  fabricPackagingFMP4,
  fabricPackagingMpegTs,
  inputPackaging,
  copyPackaging,
  copyPackagingFormats,
  alternateTranscodeEnabled,
  alternateTranscodes,
  resolution,
  videoBitrate,
  streamBitrate,
  programPidSelection,
  advancedEncodingParams,
  audioData,
  multiPathEnabled
}: {client: any} & LiveRecordingConfigParams): Promise<{writeToken: string}> => {
  ({writeToken} = await WithWriteToken(
    {client, objectId, libraryId, writeToken, finalize, commitMessage: "Update recording config"},
    async ({libraryId, objectId, writeToken}) => {
      const existingConfig = await client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config"
      });

      const recordingConfig = {...existingConfig?.recording_config};
      if(retention !== undefined) recordingConfig.part_ttl = parseInt(retention);
      if(persistent !== undefined) recordingConfig.persistent = persistent;
      if(connectionTimeout !== undefined) recordingConfig.connection_timeout = parseInt(connectionTimeout);
      if(reconnectionTimeout !== undefined) recordingConfig.reconnect_timeout = parseInt(reconnectionTimeout);
      if(copyMpegTs !== undefined) {
        recordingConfig.copy_mpegts = copyMpegTs;
        recordingConfig.input_cfg = copyMpegTs ? {
          bypass_libav_reader: true,
          copy_mode: DeriveCopyMode({fabricPackagingFMP4, fabricPackagingMpegTs}),
          copy_packaging: DeriveCopyPackaging({fabricPackagingMpegTs, copyPackaging}),
          input_packaging: inputPackaging,
          custom_read_loop_enabled: true
        } : {};
      }

      if(copyPackagingFormats !== undefined) recordingConfig.copy_packaging_formats = copyPackagingFormats;
      if(alternateTranscodeEnabled !== undefined) recordingConfig.alternate_transcode_enabled = alternateTranscodeEnabled;
      if(programPidSelection !== undefined) recordingConfig.program_pid_selection = programPidSelection;

      const recordingStreamConfig = {...existingConfig?.recording_stream_config};
      if(audioData !== undefined) {
        recordingStreamConfig.audio = audioData;
      }

      const playoutConfig = {...existingConfig?.playout_config};
      if(!skipDvrSection && dvrEnabled !== undefined) {
        playoutConfig.dvr = dvrEnabled;
        if(dvrEnabled) {
          if(dvrStartTime) {
            playoutConfig.dvr_start_time = new Date(dvrStartTime).toISOString();
          } else {
            delete playoutConfig.dvr_start_time;
          }
          if(dvrMaxDuration != null) { playoutConfig.dvr_max_duration = parseInt(dvrMaxDuration); }
        } else {
          delete playoutConfig.dvr_start_time;
          delete playoutConfig.dvr_max_duration;
        }
      }

      const liveRecordingConfigUpdate: Record<string, any> = {
        ...existingConfig,
        recording_config: recordingConfig,
        playout_config: playoutConfig,
        recording_stream_config: recordingStreamConfig
      };
      if(advancedEncodingParams && Object.keys(advancedEncodingParams).length > 0) {
        liveRecordingConfigUpdate.recording_params = {
          ...existingConfig?.recording_params,
          xc_params: advancedEncodingParams
        };
      }
      // Sibling of recording_config on live_recording_config - see AlternateTranscodeStore.CreateAlternateTranscode.
      if(alternateTranscodes !== undefined) liveRecordingConfigUpdate.alternate_transcodes = alternateTranscodes;

      await client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config",
        metadata: liveRecordingConfigUpdate
      });

      if(retention !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/part_ttl",
          metadata: parseInt(retention)
        });
      }

      if(persistent !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/persistent",
          metadata: persistent
        });
      }

      if(connectionTimeout !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/connection_timeout",
          metadata: parseInt(connectionTimeout)
        });
      }

      if(reconnectionTimeout !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/reconnect_timeout",
          metadata: parseInt(reconnectionTimeout)
        });
      }

      if(copyMpegTs !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/copy_mpegts",
          metadata: copyMpegTs
        });
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/input_cfg",
          metadata: copyMpegTs ? {
            bypass_libav_reader: true,
            copy_mode: DeriveCopyMode({fabricPackagingFMP4, fabricPackagingMpegTs}),
            copy_packaging: DeriveCopyPackaging({fabricPackagingMpegTs, copyPackaging}),
            custom_read_loop_enabled: true,
            input_packaging: inputPackaging
          } : {}
        });
      }

      // streamBitrate is a leaf under input_cfg, which the copyMpegTs block above
      // replaces wholesale - don't pass both.
      if(videoBitrate !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/video_bitrate",
          metadata: ParseBitrate(videoBitrate, "video bitrate")
        });
      }

      if(streamBitrate !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/input_cfg/stream_bitrate",
          metadata: ParseBitrate(streamBitrate, "stream bitrate")
        });
      }

      if(resolution !== undefined) {
        const dimensions = RESOLUTION_DIMENSIONS[resolution] ?? null;
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/enc_height",
          metadata: dimensions?.height ?? null
        });
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params/enc_width",
          metadata: dimensions?.width ?? null
        });
      }

      if(multiPathEnabled !== undefined) {
        let multiPathMeta: {enabled: boolean; stream_names?: string[]} = {enabled: false};
        if(multiPathEnabled) {
          const streamNames = [
            "video",
            ...Object.keys(audioData || {})
              .filter(key => audioData[key].record)
              .map((el) => `audio_${el}`)
          ];
          if(copyMpegTs) { streamNames.push("mpegts"); }
          multiPathMeta = {enabled: true, stream_names: streamNames};
        }
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/fabric_config/multipath",
          metadata: multiPathMeta
        });
      }

      if(!skipDvrSection && dvrEnabled !== undefined) {
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording/playout_config/dvr_enabled",
          metadata: dvrEnabled
        });
        await client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording_overrides/playout_config/dvr_enabled",
          metadata: dvrEnabled
        });
        if(dvrEnabled) {
          if(dvrStartTime) {
            await client.ReplaceMetadata({
              libraryId, objectId, writeToken,
              metadataSubtree: "live_recording/playout_config/dvr_start_time",
              metadata: new Date(dvrStartTime).toISOString()
            });
            await client.ReplaceMetadata({
              libraryId, objectId, writeToken,
              metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time",
              metadata: new Date(dvrStartTime).toISOString()
            });
          } else {
            await client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_start_time"});
            await client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time"});
          }
          if(dvrMaxDuration != null) {
            await client.ReplaceMetadata({
              libraryId, objectId, writeToken,
              metadataSubtree: "live_recording/playout_config/dvr_max_duration",
              metadata: parseInt(dvrMaxDuration)
            });
            await client.ReplaceMetadata({
              libraryId, objectId, writeToken,
              metadataSubtree: "live_recording_overrides/playout_config/dvr_max_duration",
              metadata: parseInt(dvrMaxDuration)
            });
          }
        } else {
          await client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_start_time"});
          await client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_max_duration"});
          await client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time"});
          await client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording_overrides/playout_config/dvr_max_duration"});
        }
      }
    }
  ));

  return {writeToken};
};
