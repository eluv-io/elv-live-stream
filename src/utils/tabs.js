import GeneralPanel from "@/pages/stream-details/general/GeneralPanel.jsx";
import RecordingPanel from "@/pages/stream-details/recording/RecordingPanel.jsx";
import PlayoutPanel from "@/pages/stream-details/playout/PlayoutPanel.jsx";
import DetailsPanel from "@/pages/stream-details/details/DetailsPanel.jsx";
import TransportStreamPanel from "@/pages/stream-details/transport-stream/TransportStreamPanel.jsx";

export const DETAILS_TABS = [
  {label: "Details", value: "status", Component: DetailsPanel},
  {label: "General Config", value: "general", Component: GeneralPanel},
  {label: "Recording Config", value: "recording", Component: RecordingPanel},
  {label: "Playout Config", value: "playout", Component: PlayoutPanel},
  {label: "Transport Stream Distribution", value: "tsDistribution", Component: TransportStreamPanel, HideTab: (stream) => stream.originUrl?.includes("rtmp")}
];
