# Output lifecycle

An **output** is not itself a live stream — it's a separate fabric object (`live_outputs/<outputId>`, under a shared `outputSettingsId` content object) representing an egress destination (SRT pull, SRT push, RTP, or UDP) that gets **mapped** to one existing input stream and relays its output externally when enabled.

## Loading

```mermaid
flowchart TD
    A[Outputs.jsx mounts] --> B["dataStore.LoadStreamList (must finish first)"]
    B --> C[LoadOutputSettingsId]
    C --> D["resolves outputSettingsId from site's<br/>live_outputs metadata"]
    D --> E["LoadOutputs: client.OutputsList<br/>(replaces outputs map wholesale)"]
```

`LoadOutputs` must run **after** `LoadStreamList` and never concurrently with output-state polling — `OutputsList`/`OutputsState` temporarily reroute the shared fabric client to a live-egress node; overlapping calls would mis-route each other's reads and 403.

## Creation

```mermaid
sequenceDiagram
    participant Modal as CreateOutputModal
    participant OutputStore
    participant FrameClient

    Modal->>OutputStore: CreateOutput(name, type, region|node, ...)
    OutputStore->>OutputStore: branch on type:<br/>srt_pull=array keys (node_ids/elvgeos),<br/>push/rtp/udp=scalar keys (node_id/elvgeo)
    OutputStore->>FrameClient: OutputsCreate(enabled:false, delivery:{type, settings})
    Note over FrameClient: new outputs are always created disabled
    opt type === srt_pull
        OutputStore->>FrameClient: OutputsResolveSrtPullUrls
    end
    FrameClient-->>OutputStore: outputData
    OutputStore->>OutputStore: outputs[outputId] = outputData
```

## Mapping a stream to an output

```mermaid
flowchart TD
    A["User selects output(s) + OpenModal('map', slugs)"] --> B{"any selected output<br/>already mapped?"}
    B -->|yes| C["activeModal = 'remap'<br/>(Remapping Confirmation dialog)"]
    B -->|no| E[MapToStreamModal opens directly]
    C --> D["Confirm 'remap': just flips<br/>activeModal = 'map', no mutation yet"]
    D --> E
    E --> F["HandleSubmit → MapStream / MapStreamBatch<br/>(bypasses OutputModalStore.Confirm)"]
    F --> G{"output was previously unmapped?"}
    G -->|yes| H[enabled auto-set to true]
    G -->|no, remap| I[enabled preserved as-is]
    H --> J[client.OutputsModify: input.stream = streamObjectId]
    I --> J
```

## Enable / disable / reset / delete / unmap

All routed through `OutputModalStore.Confirm`, which switches on `activeModal` to call the matching `OutputStore` method (single vs. batch variant chosen by `modalSlugs.length === 1`), then calls the caller-supplied `onSuccess` refresh callback and closes the modal.

```mermaid
flowchart LR
    Confirm[OutputModalStore.Confirm] -->|enable| EnableOutput["EnableOutput/Batch<br/>(throws if no mapped stream)"]
    Confirm -->|disable| DisableOutput[DisableOutput/Batch]
    Confirm -->|unmap| UnmapStream["UnmapStreamBatch<br/>enabled:false, input:null"]
    Confirm -->|reset| ResetOutput["ResetOutput<br/>OutputsStop then re-fetch OutputsState"]
    Confirm -->|delete| DeleteOutput[DeleteOutput/Batch]
    Confirm -->|tags| UpdateTags[UpdateOutputTags]
    EnableOutput --> OnSuccess[onSuccess refresh callback] --> Close[CloseModal]
    DisableOutput --> OnSuccess
    UnmapStream --> OnSuccess
    ResetOutput --> OnSuccess
    DeleteOutput --> OnSuccess
    UpdateTags --> OnSuccess
```

On error, `OutputConfirmModal` shows a red notification but deliberately leaves the modal open (no auto-close on failure), so the user can retry or cancel explicitly.

## Status polling

Mirrors the stream-status loop, run from the same `DataWrapper` cycle, sequentially **after** `streamStore.AllStreamsStatus()`:

```mermaid
sequenceDiagram
    participant DataWrapper
    participant OutputStore
    participant FrameClient

    DataWrapper->>OutputStore: AllOutputsState()
    loop each output, sequentially (not Promise.all)
        OutputStore->>FrameClient: CheckOutputState(outputId, update:true)
        Note over FrameClient: reroutes shared client to that<br/>output's egress node, restores after
        FrameClient-->>OutputStore: {state}
        OutputStore->>OutputStore: merge only .state onto stored output<br/>(doesn't touch enriched input fields)
    end
```

Per-output errors are caught individually so one failing output doesn't block refreshing the rest — unlike `LoadOutputs`, which is one all-or-nothing call used on page mount/manual refresh.

## Key files

- `src/stores/OutputStore.ts:218-256` — `LoadOutputSettingsId` / `LoadOutputs`
- `src/stores/OutputStore.ts:390-457` — `CreateOutput`
- `src/stores/OutputStore.ts:459-567` — `MapStream` / `MapStreamBatch`
- `src/stores/OutputStore.ts:569-617` — `UnmapStreamBatch`
- `src/stores/OutputStore.ts:683-851` — `EnableOutput`/`DisableOutput` (single + batch)
- `src/stores/OutputStore.ts:619-681` — `ModifyOutput`
- `src/stores/OutputStore.ts:926-954` — `ResetOutput`
- `src/stores/OutputStore.ts:853-891` — `DeleteOutput`/`DeleteOutputBatch`
- `src/stores/OutputStore.ts:263-310` — `CheckOutputState` / `AllOutputsState` (poll batch)
- `src/stores/OutputModalStore.ts:113-165` — `OpenModal` / `Confirm` orchestration, `MODAL_CONFIG`
- `src/components/data-wrapper/DataWrapper.jsx` — shared polling loop (see stream-lifecycle.md)