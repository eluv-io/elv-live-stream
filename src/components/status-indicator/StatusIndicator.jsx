import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import {StatusColor} from "@/utils/helpers.js";
import {STATUS_TEXT} from "@/utils/constants.js";

const StatusIndicator = ({status, ...props}) => (
  <LabeledIndicator
    label={STATUS_TEXT[status]}
    color={StatusColor(status)}
    {...props}
  />
);

export default StatusIndicator;