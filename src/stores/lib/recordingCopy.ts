// Recording copy helpers: resolving the time range a VoD copy covers.
import type {RecordingPeriod} from "@/utils/stream/stream";

const EpochSec = (time: string) => Math.floor(new Date(time).getTime() / 1000);
const IsoTime = (epochSec: number) => new Date(epochSec * 1000).toISOString();

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

  if(sorted.length === 1 && !startTime && !endTime) {
    return {recordingPeriod: first.id, startTime: undefined, endTime: undefined, startSec, endSec};
  }

  return {
    recordingPeriod: null,
    startTime: IsoTime(startSec),
    endTime: IsoTime(endSec),
    startSec,
    endSec
  };
};
