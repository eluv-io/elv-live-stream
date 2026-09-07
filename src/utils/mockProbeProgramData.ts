import {ProbeProgram} from "@/utils/stream";

// TEMPORARY: no SDK/fabric support exists today for multiprogram MPEG-TS
// probe data (no `programs`/PID structure anywhere in GetStreamProbe or
// InputStreamInfo - confirmed against @eluvio/elv-client-js 4.2.14). This
// mock stands in for that data until the fabric team exposes it; swap the
// import in ProgramPidSelector.jsx for a real store call once it exists.
// PID selections a user makes against this mock are still real form state
// and do get persisted - only the program/PID list itself is fake.
export const MOCK_PROBE_PROGRAMS: ProbeProgram[] = [
  {
    id: "program-101",
    number: 101,
    name: "FOX News Channel",
    pids: [
      {pid: 256, type: "video", codec: "H.264", description: "Main Video"},
      {pid: 257, type: "audio", codec: "aac", description: "English"}
    ]
  },
  {
    id: "program-102",
    number: 102,
    name: "FOX Sports 1",
    pids: [
      {pid: 259, type: "video", codec: "H.264", description: "Main Video"},
      {pid: 641, type: "audio", codec: "aac", description: "English"},
      {pid: 134, type: "audio", codec: "aac", description: "Spanish"},
      {pid: 1522, type: "audio", codec: "aac", description: "Commentary"},
      {pid: 531, type: "audio", codec: "aac", description: "Germany"},
      {pid: 124, type: "data", codec: "SCTE", description: "-"}
    ]
  },
  {
    id: "program-103",
    number: 103,
    name: "FOX Sports Racing",
    pids: [
      {pid: 340, type: "video", codec: "H.264", description: "Main Video"},
      {pid: 341, type: "audio", codec: "aac", description: "English"}
    ]
  }
];
