# Stream lifecycle

A stream is a content object on the Eluvio Fabric. This covers creation, configuration (probing), the start/stop/reset operations, and the background status-polling loop that keeps `StreamStatusStore` in sync with fabric state.

## Creation

```mermaid
sequenceDiagram
    participant UI
    participant StreamEditStore
    participant FrameClient
    participant StreamStatusStore
    participant StreamDetailStore

    UI->>StreamEditStore: InitLiveStreamObject(url, encryption, configProfile, ...)
    StreamEditStore->>StreamEditStore: ParseLiveConfigData(...)
    StreamEditStore->>FrameClient: StreamCreate(libraryId, objectId, url, liveRecordingConfig, options)
    FrameClient-->>StreamEditStore: {objectId}
    StreamEditStore->>StreamStatusStore: CheckStatus({objectId})
    StreamEditStore->>StreamDetailStore: LoadStreamMetadata({objectId, libraryId})
    StreamEditStore->>StreamStatusStore: SetStream(slug, streamValue)
    StreamEditStore-->>UI: {objectId, slug}
```

`DuplicateStream` is a variant: `CopyContentObject` → `CheckStatus` → `StreamCreate` (options only, no `liveRecordingConfig`) → `CheckStatus` → `LoadStreamMetadata` → `SetStream`.

## Configuration ("Check Stream" / probe)

Triggered by the "Check Stream" confirmation modal (`StreamModalStore.OP_MAP.CHECK`).

```mermaid
sequenceDiagram
    participant UI as "Check Stream" modal
    participant StreamEditStore
    participant FrameClient
    participant StreamStatusStore
    participant StreamDetailStore
    participant SettingsStore

    UI->>StreamEditStore: ConfigureStream({objectId})
    StreamEditStore->>FrameClient: EditContentObject → writeToken
    StreamEditStore->>StreamEditStore: strip input_stream_info / probe_info<br/>(forces re-probe)
    StreamEditStore->>FrameClient: StreamConfig(writeToken, liveRecordingConfig,<br/>finalize:false, fcTimeout:180)
    opt syncAudioToProbe (default true)
        StreamEditStore->>StreamEditStore: SyncAudioToProbe(writeToken, finalize:false)
    end
    StreamEditStore->>FrameClient: FinalizeContentObject("Apply live stream configuration")
    StreamEditStore->>SettingsStore: SaveStreamLink(objectId, slug)
    StreamEditStore->>StreamStatusStore: CheckStatus
    StreamEditStore->>StreamDetailStore: LoadStreamMetadata
    StreamEditStore->>StreamStatusStore: SetStream(slug, {status, warnings, quality, ...})
```

Errors are split into timeout vs. other for logging, then re-thrown either way.

## Start / Stop / Reset / Deactivate

All three of START / STOP / RESET share one fabric call, `StreamStartOrStopOrReset`, dispatched via `StreamStatusStore.OperateLRO`. Deactivate is a separate, non-fatal call.

```mermaid
flowchart TD
    Start([StartStream: slug]) --> CheckStatus[CheckStatus]
    CheckStatus --> State{state?}
    State -->|unconfigured / uninitialized| Throw[throw "Stream not ready to start"]
    State -->|starting / running / stalled| NoOp[no-op: already active]
    State -->|stopped / inactive / other| TokenCheck{edge_write_token<br/>matches metadata?}
    TokenCheck -->|no match| StartRecording[StreamStartRecording]
    TokenCheck -->|match| SetActive
    StartRecording --> SetActive["_SetStreamActive(slug, active: true)"]
    SetActive --> Operate[OperateLRO op=START]
    Operate --> LRO[StreamStartOrStopOrReset<br/>op: start/stop/reset]
    LRO --> SetStream[SetStream: status = response.state]

    StopCall([Stop / Reset request]) --> Operate

    Deactivate([DeactivateStream]) --> StopRecording[StreamStopRecording]
    StopRecording --> SetInactive["_SetStreamActive(slug, active: false)"]
    SetInactive --> UpdateStream2[SetStream: status = response.state]
    StopRecording -.error: log only, no throw.-> UpdateStream2
```

## Status polling

`DataWrapper` drives a **recursive `setTimeout` loop** (not `setInterval`) at a 60s delay — the next poll is scheduled only after the previous one fully resolves, so a slow poll never stacks onto the next. Each cycle awaits `streamStatusStore.LoadAllStreamsStatus()` then `outputStore.LoadAllOutputsState()`.

`LoadAllStreamsStatus` is two-phase. `_ClassifyStreams` first does a cheap, fabric-node-free pass over every stream — a narrow `ContentObjectMetadata` read that mirrors the pre-bitcode branch of client-js `StreamStatus`: no `live_recording_config/url` → `unconfigured`; missing `live_recording` fabric/playout/recording config → `uninitialized`; no `live_recording/status/edge_write_token` (nor `fabric_config/edge_write_token`) → `inactive`. Those states are written directly. Only streams that still hold an edge write token are "active" and get the full `StreamStatus` call. `activeStreamSlugs` is rebuilt every poll, and nudged optimistically by `StartStream` (add) and `DeactivateStream` (remove) so the UI reacts before the next cycle; `_ReplaceStreams` prunes slugs dropped from the list.

```mermaid
sequenceDiagram
    participant DataWrapper
    participant StreamStatusStore
    participant FrameClient

    loop every 60s (chained via setTimeout, not setInterval)
        DataWrapper->>StreamStatusStore: LoadAllStreamsStatus()
        alt already loadingStatus
            StreamStatusStore-->>DataWrapper: skip (no overlap)
        else
            StreamStatusStore->>StreamStatusStore: loadingStatus = true
            StreamStatusStore->>FrameClient: _ClassifyStreams: read local metadata per stream<br/>(LimitedMap, concurrency 15)
            FrameClient-->>StreamStatusStore: live_recording_config/url, live_recording/*/config,<br/>live_recording/status/edge_write_token
            StreamStatusStore->>StreamStatusStore: no token -> SetStream(status = unconfigured / uninitialized / inactive)<br/>token -> activeStreamSlugs.add(slug)
            StreamStatusStore->>FrameClient: CheckStatus per ACTIVE stream only<br/>(LimitedMap, concurrency 15)
            FrameClient-->>StreamStatusStore: {state, warnings, quality, embedUrl}
            StreamStatusStore->>StreamStatusStore: SetStream per active slug
            StreamStatusStore->>StreamStatusStore: loadingStatus = false
        end
        DataWrapper->>DataWrapper: outputStore.LoadAllOutputsState() (see output-lifecycle.md)
    end
```

## Status states

Defined in `STATUS_MAP`: `unconfigured`, `uninitialized`, `initialized`, `inactive`, `stopped`, `starting`, `running`, `stalled`, `degraded`, `unavailable`.

`StreamModalStore.BATCH_READY_STATUSES` governs which batch operations are enabled from which states:

| Operation | Ready from |
|---|---|
| START | `inactive`, `stopped` |
| STOP | `starting`, `running`, `stalled` |
| DEACTIVATE | `stopped` |
| DELETE | `inactive`, `uninitialized`, `unconfigured`, `initialized` |

## Key files

- `src/stores/streams/StreamEditStore.ts` — `InitLiveStreamObject` (creation)
- `src/stores/streams/StreamEditStore.ts` — `DuplicateStream`
- `src/stores/streams/StreamEditStore.ts` — `ConfigureStream`
- `src/stores/streams/StreamStatusStore.ts` — `StartStream`
- `src/stores/streams/StreamStatusStore.ts` — `OperateLRO` (shared START/STOP/RESET)
- `src/stores/streams/StreamStatusStore.ts` — `DeactivateStream`
- `src/stores/streams/StreamStatusStore.ts` — `LoadAllStreamsStatus` (classify + poll batch)
- `src/stores/streams/StreamListStore.ts` — `LoadStreamList` / `LoadMoreStreamList` (streams page), `LoadAllStreams` (unscoped set for stream pickers)
- `src/stores/streams/StreamStatusStore.ts` — `_ClassifyStreams` (cheap local-metadata classification)
- `src/stores/streams/StreamStatusStore.ts` — `_SetStreamActive` (active-poll set membership)
- `src/stores/streams/StreamStatusStore.ts` — `CheckStatus`
- `src/components/data-wrapper/DataWrapper.jsx` — polling loop scheduler
- `src/utils/constants.ts` — `STATUS_MAP`
- `src/stores/streams/StreamModalStore.ts` — `BATCH_READY_STATUSES`