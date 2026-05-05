import GeneralPanel from "@/pages/streams/details/general/GeneralPanel.jsx";
import RecordingPanel from "@/pages/streams/details/recording/RecordingPanel.jsx";
import PlayoutPanel from "@/pages/streams/details/playout/PlayoutPanel.jsx";
import SummaryPanel from "@/pages/streams/details/summary/SummaryPanel.jsx";
import TransportStreamPanel from "@/pages/streams/details/transport-stream/TransportStreamPanel.jsx";

export const DETAILS_TABS = [
  {label: "Summary", value: "status", Component: SummaryPanel},
  {label: "General Config", value: "general", Component: GeneralPanel},
  {label: "Recording Config", value: "recording", Component: RecordingPanel},
  {label: "Playout Config", value: "playout", Component: PlayoutPanel},
  {label: "Transport Stream Distribution", value: "tsDistribution", Component: TransportStreamPanel, HideTab: (stream) => stream.originUrl?.includes("rtmp")}
];
