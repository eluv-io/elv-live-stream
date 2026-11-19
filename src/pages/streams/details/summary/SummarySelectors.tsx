import {Anchor, Badge, Group, Text} from "@mantine/core";
import {BytesToMb, DateFormat} from "@/utils/formatters";
import {STATUS_MAP, QUALITY_TEXT, QUALITY_COLOR_MAP, SOURCE_PACKAGING_COLOR_MAP} from "@/utils/constants";
import {Runtime} from "@/utils/helpers";
import {LogEntries} from "@/utils/stream/stream";
import LabeledIndicator from "@/components/labeled-indicator/LabeledIndicator.jsx";
import sharedStyles from "@/assets/shared.module.css";

/**
 * Pure data-shaping functions for SummaryPanel display data.
 * All are independently testable with no component mounting required.
 */

export const BuildStateData = ({status, errors, onViewErrors}: {status: any; errors?: unknown; onViewErrors?: () => void}) => {
  const errorCount = LogEntries(errors).length;

  return [
    {
      label: "Quality",
      value: (
        <LabeledIndicator
          label={QUALITY_TEXT[status?.quality] || ""}
          color={status?.quality ? QUALITY_COLOR_MAP[status?.quality] : null}
          fz={14}
          fw={600}
        />
      )
    },
    ...(errorCount > 0 ? [{
      label: "Errors",
      value: (
        <Group gap={6}>
          <Text c="elv-red.4" fw={600} fz="0.875rem">{ errorCount }</Text>
          <Text c="elv-gray.5" fz="0.875rem">·</Text>
          <Anchor component="button" type="button" fz="0.875rem" fw={600} onClick={onViewErrors}>
            View log
          </Anchor>
        </Group>
      )
    }] : [])
  ];
};

export const BuildRecordingData = ({
  recordingInfo,
  status,
  currentTimeMs
}: {
  recordingInfo: any;
  status: any;
  currentTimeMs: number;
}) => {
  const isActive = [STATUS_MAP.RUNNING, STATUS_MAP.STARTING].includes(status?.state);

  return [
    {
      label: "Recording Start",
      value: recordingInfo?._recordingStartTime
        ? DateFormat({time: recordingInfo._recordingStartTime, format: "sec"})
        : ""
    },
    {
      label: "Runtime",
      value: isActive
        ? Runtime({startTime: recordingInfo?._recordingStartTime * 1000, currentTimeMs, active: true, format: "hh:mm:ss"})
        : ""
    },
    {
      label: "Last Connect",
      value: status?.recordingPeriod?.startTimeEpochSec
        ? DateFormat({time: status.recordingPeriod.startTimeEpochSec, format: "sec"})
        : ""
    },
    {
      label: "Last Runtime",
      value: isActive
        ? Runtime({startTime: status?.recordingPeriod?.startTimeEpochSec * 1000, currentTimeMs, active: true, format: "hh:mm:ss"})
        : ""
    }
  ];
};

const sourceBadges = (items: string[]) => (
  <Group gap={4}>
    {(items || []).map(el => (
      <Badge
        key={`source-${el}`}
        radius={2}
        color={SOURCE_PACKAGING_COLOR_MAP[el]}
        c="elv-gray.7"
        tt="uppercase"
        fz={12}
        fw={400}
        classNames={{label: sharedStyles.badgeLabel}}
      >
        {el}
      </Badge>
    ))}
  </Group>
);

export const BuildSourceData = ({stream, status}: {stream: any; status: any}) => [
  {label: "Input", value: sourceBadges(stream?.source)},
  {
    label: "Packets Recv / Drop (%)",
    value: status
      ? `${status?.input_stats?.ts?.packets_received?.toLocaleString() ?? 0} / ${status?.input_stats?.ts?.packets_dropped?.toLocaleString() ?? 0} (${status?.input_stats?.ts?.packets_received ? (status.input_stats.ts.packets_dropped / status.input_stats.ts.packets_received).toFixed(2) : 0}%)`
      : ""
  },
  {
    label: "Seq Errors / Gap",
    value: status
      ? `${status?.input_stats?.rtp?.seq_num_skip_tot ?? 0} / ${status?.input_stats?.rtp?.seq_num_skip_count ?? 0}`
      : ""
  }
];

export const BuildPackagingData = ({
  stream,
  status,
  loadingStatus
}: {
  stream: any;
  status: any;
  loadingStatus: boolean;
}) => [
  {label: "Packaging", value: sourceBadges(stream?.packaging)},
  {
    label: "Bytes",
    value: loadingStatus ? null : status?.recordingStatus?.video?.bytes_written
      ? BytesToMb(status.recordingStatus.video.bytes_written)
      : ""
  },
  {label: "Incidents", value: 0}
];
