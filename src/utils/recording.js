export const MeetsDurationMin = ({startTime, endTime}) => {
  startTime = new Date(startTime).getTime();
  endTime = new Date(endTime).getTime();

  // If starting or currently running, part is copyable
  if(endTime === 0 || startTime === 0) { return true; }

  return (endTime - startTime) >= 61000;
};

export const IsWithinRetentionPeriod = ({startTime, persistent, retention}) => {
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
}) => {
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
