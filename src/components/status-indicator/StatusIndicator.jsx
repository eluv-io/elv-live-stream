import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import {LogEntries, LogSummary, StatusColor} from "@/utils/stream/stream.ts";
import {QUALITY_MAP, QUALITY_TEXT, STATUS_TEXT} from "@/utils/constants.ts";

// Errors take priority over a non-good quality warning.
const StatusIndicator = ({status, errors, quality, onErrorClick, showWarning, ...props}) => {
  const errorEntries = LogEntries(errors);
  const showError = errorEntries.length > 0;
  const qualityWarning = !!quality && quality !== QUALITY_MAP.GOOD;

  return (
    <LabeledIndicator
      label={STATUS_TEXT[status]}
      color={StatusColor(status)}
      showError={showError}
      showWarning={!showError && (showWarning || qualityWarning)}
      tooltip={showError ? LogSummary(errorEntries) : (qualityWarning ? `Quality: ${QUALITY_TEXT[quality] ?? quality}` : undefined)}
      onClick={showError ? onErrorClick : undefined}
      {...props}
    />
  );
};

export default StatusIndicator;
