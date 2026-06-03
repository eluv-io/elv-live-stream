export const MeetsDurationMin = ({startTime, endTime}: {startTime: number, endTime: number}): boolean => {
  startTime = new Date(startTime).getTime();
  endTime = new Date(endTime).getTime();

  // If starting or currently running, part is copyable
  if(endTime === 0 || startTime === 0) { return true; }

  return (endTime - startTime) >= 61000;
};

export const IsWithinRetentionPeriod = ({startTime, persistent, retention}: {startTime: number, persistent?: boolean, retention: string}): boolean => {
  const currentTimeMs = new Date().getTime();
  const startTimeMs = new Date(startTime).getTime();

  if(persistent) { return true; }

  const retentionMs = parseInt(retention || "") * 1000;

  if(isNaN(startTimeMs)) { return false; }

  return (currentTimeMs - startTimeMs) < retentionMs;
};

export const RecordingPeriodIsExpired = ({
  parts=[],
  startTime,
  endTime,
  retention
}: {parts: string[], startTime: number, endTime: number, retention: string}): boolean => {
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
