// Output shapes: raw fabric metadata (Output) and the flattened table/detail row (FlatOutput).
import type {StreamPackaging, StreamSource} from "@/utils/stream/stream";
import type {OutputLocation} from "@/utils/helpers";

// Passed through verbatim from the fabric. `name`/`quality`/`stats` are
// resolved client-side by LoadFailoverStreamInfo. Never nests.
export interface OutputInputFailover {
  after?: string;
  disconnect_outputs?: boolean;
  name?: string;
  status?: string;
  quality?: string;
  stats?: any;
  input?: {stream?: string};
}

export interface OutputInput {
  stream?: string;
  name?: string;
  status?: string;
  url?: string;
  embedUrl?: string;
  source?: StreamSource[];
  packaging?: StreamPackaging[];
  quality?: string;
  stats?: any;
  failover?: OutputInputFailover;
}

interface OutputSrtPull {
  node_ids?: string[];
  urls?: string[];
  elvgeos?: string[];
  connection?: {
    enforced_encryption?: string;
  };
  passphrase?: string;
  strip_rtp?: boolean;
}

interface OutputSrtPush {
  node_id?: string;
  url?: string;
  elvgeo?: string;
  location?: "global" | "elvgeo" | "datacenter" | "nid";
  connection?: {
    enforced_encryption?: string;
  };
  passphrase?: string;
  strip_rtp?: boolean;
}

// RTMP push: the node pushes to `url` (rtmp:// or TLS) using `stream_key`.
interface OutputRtmp {
  node_id?: string;
  url?: string;
  stream_key?: string;
}

// Shared shape for the rtp and udp outputs.
interface OutputRtpUdp {
  node_id?: string;
  url?: string;
  elvgeo?: string;
}

// Raw output as stored in stream metadata: nested, keyed by transport (rtp/udp/srt_*).
export interface Output {
  enabled?: boolean;
  input?: OutputInput;
  name?: string;
  description?: string;
  // Front-end data stored as-is by the fabric; `location` is the geo/node pick.
  custom?: {location?: OutputLocation, [key: string]: any};
  rtp?: OutputRtpUdp;
  udp?: OutputRtpUdp;
  rtmp?: OutputRtmp;
  srt_pull?: OutputSrtPull;
  srt_push?: OutputSrtPush;
  state?: any;
  tags?: string[];
}

export type Outputs = Record<string, Output>;

export type OutputType = "SRT PULL" | "SRT PUSH" | "RTP" | "UDP" | "RTMP" | "RTMPS" | "TS";

// Output flattened for the UI: url/type/source pulled up out of the transport nesting,
// plus the owning stream's id/name/status added on, for table rows.
export interface FlatOutput {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
  enabled?: boolean;
  streamId?: string;
  streamName?: string;
  streamStatus?: string;
  url?: string;
  type?: OutputType[];
  packaging?: string[];
  source?: string[];
  connectedClients: number;
  input?: OutputInput;
}
