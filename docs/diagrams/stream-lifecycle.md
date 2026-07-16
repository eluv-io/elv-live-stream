# Stream lifecycle

A stream is a content object on the Eluvio Fabric. This covers creation, configuration (probing), the start/stop/reset operations, and the background status-polling loop that keeps `StreamStore` in sync with fabric state.

## Creation

```mermaid
sequenceDiagram
    participant UI
    participant StreamEditStore
    participant FrameClient
    participant StreamStore

    UI->>StreamEditStore: InitLiveStreamObject(url, encryption, configProfile, ...)
    StreamEditStore->>StreamEditStore: ParseLiveConfigData(...)
    StreamEditStore->>FrameClient: StreamCreate(libraryId, objectId, url, liveRecordingConfig, options)
    FrameClient-->>StreamEditStore: {objectId}
    StreamEditStore->>StreamStore: CheckStatus({objectId})
    StreamEditStore->>StreamStore: LoadStreamMetadata({objectId, libraryId})
    StreamEditStore->>StreamStore: UpdateStream(slug, streamValue)
    StreamEditStore-->>UI: {objectId, slug}
```

`DuplicateStream` is a variant: `CopyContentObject` → `CheckStatus` → `StreamCreate` (options only, no `liveRecordingConfig`) → `CheckStatus` → `LoadStreamMetadata` → `UpdateStream`.

## Configuration ("Check Stream" / probe)

Triggered by the "Check Stream" confirmation modal (`ModalStore.OP_MAP.CHECK`).

```mermaid
sequenceDiagram
    participant UI as "Check Stream" modal
    participant StreamEditStore
    participant FrameClient
    participant StreamStore

    UI->>StreamEditStore: ConfigureStream({objectId})
    StreamEditStore->>FrameClient: EditContentObject → writeToken
    StreamEditStore->>StreamEditStore: strip input_stream_info / probe_info<br/>(forces re-probe)
    StreamEditStore->>FrameClient: StreamConfig(writeToken, liveRecordingConfig,<br/>finalize:false, fcTimeout:180)
    opt syncAudioToProbe (default true)
        StreamEditStore->>StreamEditStore: SyncAudioToProbe(writeToken, finalize:false)
    end
    StreamEditStore->>FrameClient: FinalizeContentObject("Apply live stream configuration")
    StreamEditStore->>StreamStore: UpdateStreamLink(objectId, slug)
    StreamEditStore->>StreamStore: CheckStatus + LoadStreamMetadata
    StreamEditStore->>StreamStore: UpdateStream(slug, {status, warnings, quality, ...})
```

Errors are split into timeout vs. other for logging, then re-thrown either way.

## Start / Stop / Reset / Deactivate

All three of START / STOP / RESET share one fabric call, `StreamStartOrStopOrReset`, dispatched via `StreamStore.OperateLRO`. Deactivate is a separate, non-fatal call.

```mermaid
flowchart TD
    Start([StartStream: slug]) --> CheckStatus[CheckStatus]
    CheckStatus --> State{state?}
    State -->|unconfigured / uninitialized| Throw[throw "Stream not ready to start"]
    State -->|starting / running / stalled| NoOp[no-op: already active]
    State -->|stopped / inactive / other| TokenCheck{edge_write_token<br/>matches metadata?}
    TokenCheck -->|no match| StartRecording[StreamStartRecording]
    TokenCheck -->|match| Operate
    StartRecording --> Operate[OperateLRO op=START]
    Operate --> LRO[StreamStartOrStopOrReset<br/>op: start/stop/reset]
    LRO --> UpdateStream[UpdateStream: status = response.state]

    StopCall([Stop / Reset request]) --> Operate

    Deactivate([DeactivateStream]) --> StopRecording[StreamStopRecording]
    StopRecording --> UpdateStream2[UpdateStream: status = response.state]
    StopRecording -.error: log only, no throw.-> UpdateStream2
```

## Status polling

`DataWrapper` drives a **recursive `setTimeout` loop** (not `setInterval`) at a 60s delay — the next poll is scheduled only after the previous one fully resolves, because overlapping polls were found to corrupt node routing. Each cycle awaits `streamStore.AllStreamsStatus()` **then** `outputStore.AllOutputsState()` sequentially (both reroute the shared client to a live-egress node, so concurrency would race).

```mermaid
sequenceDiagram
    participant DataWrapper
    participant StreamStore
    participant FrameClient

    loop every 60s (chained via setTimeout, not setInterval)
        DataWrapper->>StreamStore: AllStreamsStatus()
        alt already loadingStatus
            StreamStore-->>DataWrapper: skip (no overlap)
        else
            StreamStore->>StreamStore: loadingStatus = true
            StreamStore->>FrameClient: CheckStatus per stream<br/>(LimitedMap, concurrency 15)
            FrameClient-->>StreamStore: {state, warnings, quality, embedUrl}
            StreamStore->>StreamStore: UpdateStream per slug
            StreamStore->>StreamStore: loadingStatus = false
        end
        DataWrapper->>DataWrapper: outputStore.AllOutputsState() (see output-lifecycle.md)
    end
```

## Status states

Defined in `STATUS_MAP`: `unconfigured`, `uninitialized`, `initialized`, `inactive`, `stopped`, `starting`, `running`, `stalled`, `degraded`, `unavailable`.

`ModalStore.BATCH_READY_STATUSES` governs which batch operations are enabled from which states:

| Operation | Ready from |
|---|---|
| START | `inactive`, `stopped` |
| STOP | `starting`, `running`, `stalled` |
| DEACTIVATE | `stopped` |
| DELETE | `inactive`, `uninitialized`, `unconfigured`, `initialized` |

## Key files

- `src/stores/StreamEditStore.ts:241-317` — `InitLiveStreamObject` (creation)
- `src/stores/StreamEditStore.ts:319-394` — `DuplicateStream`
- `src/stores/StreamEditStore.ts:1126-1202` — `ConfigureStream`
- `src/stores/StreamStore.ts:223-264` — `StartStream`
- `src/stores/StreamStore.ts:266-293` — `OperateLRO` (shared START/STOP/RESET)
- `src/stores/StreamStore.ts:295-306` — `DeactivateStream`
- `src/stores/StreamStore.ts:190-219` — `AllStreamsStatus` (poll batch)
- `src/stores/StreamStore.ts:151-188` — `CheckStatus`
- `src/components/data-wrapper/DataWrapper.jsx:20-58` — polling loop scheduler
- `src/utils/constants.ts:8-19` — `STATUS_MAP`
- `src/stores/ModalStore.ts:91-96` — `BATCH_READY_STATUSES`