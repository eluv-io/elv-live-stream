# Profile apply flow

Applying a profile to a stream is driven by `StreamEditStore.ApplyStreamProfile`, almost always via `UpdateGeneralConfig` (the General panel's Save path). The key branch is `probeCleared`, returned by the fabric-js `StreamApplyProfile` call, which decides whether the client needs to resync audio settings.

## `ApplyStreamProfile`

```mermaid
sequenceDiagram
    participant Caller as UpdateGeneralConfig
    participant StreamEditStore
    participant ProfileStore
    participant FrameClient

    Caller->>StreamEditStore: ApplyStreamProfile(objectId, writeToken, profileSlug, finalize)
    StreamEditStore->>ProfileStore: profiles[profileSlug]
    StreamEditStore->>FrameClient: StreamApplyProfile(profile, objectId,<br/>streamWriteToken, finalize:false)
    Note over FrameClient: fabric-side: resets live_recording /<br/>live_recording_overrides, internally<br/>calls the StreamConfig equivalent
    FrameClient-->>StreamEditStore: {streamWriteToken?, siteWriteToken?, probeCleared?}

    alt probeCleared is falsy
        StreamEditStore->>StreamEditStore: UpdateStreamAudioSettings(finalize:false)
        Note right of StreamEditStore: resyncs recording_stream_config/audio<br/>and ladder specs to what was probed
    else probeCleared is true
        Note right of StreamEditStore: skip resync — profile apply already<br/>reset probe state, resync would be premature
    end

    opt finalize (caller-level, default true)
        StreamEditStore->>FrameClient: FinalizeContentObject(stream, "Apply stream profile")
        opt response.siteWriteToken present
            StreamEditStore->>FrameClient: FinalizeContentObject(site, "Apply stream profile")
        end
    end
    StreamEditStore-->>Caller: response
```

## Caller: `UpdateGeneralConfig` (General panel Save)

`ApplyStreamProfile` is called with `finalize: false` here, so the outer method controls the single combined commit.

```mermaid
flowchart TD
    A[UpdateGeneralConfig] --> B[UpdateDetailMetadata<br/>name/url/description/tags, finalize:false]
    B --> C{configProfile set?}
    C -->|no| G
    C -->|yes| D[ApplyStreamProfile<br/>finalize:false]
    D --> E{siteWriteToken<br/>returned?}
    E -->|yes| F[FinalizeContentObject site<br/>'Update profile streams']
    E -->|no| G
    F --> G{updatePermission /<br/>updateAccessGroup?}
    G -->|yes| H[SetPermission /<br/>UpdateAccessGroupPermission]
    G -->|no| I
    H --> I[FinalizeContentObject stream<br/>'Apply general config']
    I --> J[StreamStore.UpdateStream<br/>tags, configProfile]
    J --> K[return probeCleared]
```

Note: `probeCleared` returned from `UpdateGeneralConfig` is captured by `GeneralPanel.Save()` but not currently read further — the UI does not branch on it. Worth knowing if you're tracing "why didn't anything visibly change" on a profile apply.

## `ProfileStore` — where profiles come from

- `LoadProfiles()` — `client.StreamConfigProfiles({resolveLinks: true})` populates `profiles` (slug → profile, read-only "original") and seeds `drafts` (editable copies) as a shallow copy.
- `SaveProfiles()` writes each dirty draft via `client.StreamSaveConfigProfile`. On rename, it also migrates `public/asset_metadata/profile_streams/<oldSlug>` → `<newSlug>` on the site object — this is the `stream_profiles` mapping referenced in CLAUDE.md, and it must move atomically with the profile rename.
- `DeleteProfile(slug)` deletes both the `live_stream_profiles/<slug>.json` file and the `public/asset_metadata/profiles/<slug>` metadata.

`ApplyStreamProfile`'s `siteWriteToken` finalize step corresponds to `StreamApplyProfile` itself updating this same site-object profile↔stream bookkeeping fabric-side.

## Key files

- `src/stores/StreamEditStore.ts:1069-1122` — `ApplyStreamProfile`
- `src/stores/StreamEditStore.ts:921-1009` — `UpdateGeneralConfig` (primary caller)
- `src/stores/StreamEditStore.ts:1602-1639` — `UpdateStreamAudioSettings` fallback branch (reconstructs audio index from ladder specs when no probe data exists yet)
- `src/pages/streams/details/general/GeneralPanel.jsx:115-128` — `Save()`, where `probeCleared` is returned but unused
- `src/stores/ProfileStore.ts:33-46` — `LoadProfiles`
- `src/stores/ProfileStore.ts:110-190` — `SaveProfiles` (includes rename migration of `profile_streams`)
- `src/stores/ProfileStore.ts:69-102` — `DeleteProfile`