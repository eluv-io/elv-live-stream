// Recording copy helpers: resolving the time range a VoD copy covers.
import type {RecordingPeriod} from "@/utils/stream/stream";

const EpochSec = (time: string) => Math.floor(new Date(time).getTime() / 1000);
const IsoTime = (epochSec: number) => new Date(epochSec * 1000).toISOString();

/** Whether `xc_params` match the 2.56s segment configuration required for partial-range copies. */
export const SupportsTimeRange = (xcParams?: Record<string, unknown>) =>
  xcParams?.audio_seg_duration_ts === 1843200 &&
  xcParams?.force_keyint === 128 &&
  xcParams?.seg_duration === "38.4" &&
  xcParams?.video_seg_duration_ts === 3456000;

/**
 * The `StreamCopyToVod` selection args plus the epoch-second bounds to record for a copy.
 * Given times win over the selected periods' bounds; a still-recording period ends at `nowSec`.
 * Throws RangeError on an invalid time.
 */
export const CopyToVodRange = ({periods, startTime, endTime, nowSec}: {
  periods: RecordingPeriod[],
  startTime?: string,
  endTime?: string,
  nowSec: number
}) => {
  const sorted = [...periods].sort((a, b) => a?.start_time_epoch_sec - b?.start_time_epoch_sec);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const startSec = startTime ? EpochSec(startTime) : first?.start_time_epoch_sec;
  const endSec = endTime ? EpochSec(endTime) : (last?.end_time_epoch_sec || nowSec);

  // -1 (not the period id) when trimming; the period id copies the whole period regardless of times
  if(sorted.length === 1) {
    return {
      recordingPeriod: startTime || endTime ? -1 : first.id,
      startTime: startTime ? IsoTime(startSec) : undefined,
      endTime: endTime ? IsoTime(endSec) : undefined,
      startSec,
      endSec
    };
  }

  return {
    recordingPeriod: null,
    startTime: IsoTime(startSec),
    endTime: IsoTime(endSec),
    startSec,
    endSec
  };
};
