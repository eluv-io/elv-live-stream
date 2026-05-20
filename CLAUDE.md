# CLAUDE.md

## What this app is

A React app for creating and managing Eluvio live streams. It runs embedded inside Eluvio Core as a frame client — all SDK calls go through `FrameClient`, which posts messages to the parent window.

## Tech stack

- **React 18** + **MobX 6** (observer pattern, strict actions enforced)
- **Mantine 8** for UI components
- **Vite** for bundling (`npm run serve` → port 8155)
- **Vitest** + **React Testing Library** for tests (`npm run test:run`)
- **`@eluvio/elv-client-js`** — the Eluvio SDK, the source of truth for all fabric operations

## Key concepts

**Streams** are content objects on the Eluvio Fabric. Each stream has metadata split across:
- `live_recording_config` — user-configurable settings (URL, profile, audio, watermark, DRM)
- `live_recording` — computed/applied config (written by `StreamConfig` and `StreamApplyProfile`)

**Profiles** are reusable configuration templates stored in the site object under `/profiles`. They are keyed by slug (derived from name). Stream↔profile associations are tracked in the site object under `stream_profiles: { profile_slug: [stream_ids] }`.

**`StreamApplyProfile`** (client-js) applies a profile to a stream. It resets `live_recording` and `live_recording_overrides`, then calls `StreamConfig` internally if `input_stream_info` is present. It returns `{ probeCleared: true }` when probe data was cleared (profile had no `input_stream_info`).

## Store structure

All stores live in `src/stores/` and are instantiated by `RootStore`:

| Store | Responsibility |
|-------|---------------|
| `DataStore` | Tenant/site metadata, access groups, libraries, permissions |
| `StreamStore` | Stream list, status polling, start/stop/reset |
| `StreamEditStore` | All stream write operations (configure, save, apply profile) |
| `ProfileStore` | Profile CRUD |
| `ModalStore` | Centralized confirmation modal state |
| `OutputStore` | Output stream settings |
| `SiteStore` | Site object writes |

Stores use MobX `flow()` for async methods. The `this.` warnings in nested flow functions are pre-existing lint noise — not real errors.

Stores are imported from `@/stores/index.js` in components.

## Path aliases

`@/` maps to `src/` (configured in `vite.config.js` and `jsconfig.json`).

## Dev commands

```
npm run serve       # dev server on port 8155
npm run test:run    # run tests once
npm test            # watch mode
npm run lint        # lint + autofix
```

## Testing conventions

See `.claude/agents/live-stream-qa.md` for full testing standards. Key points:
- Vitest + jsdom + React Testing Library
- Always wrap renders in `<MantineProvider>`
- Always mock `mantine-datatable` (jsdom can't measure layout)
- Mock stores via `vi.mock("@/stores/index.js", ...)`
- `dataStore` mock must include `client: { permissionLevels: {} }` for `GeneralPanel`
- Canonical examples: `src/stores/StreamManagementStore.test.js` (stores), `src/pages/outputs/Outputs.test.jsx` (components)

## Security reviews

Run via the agent in `.claude/agents/security_review_agent.md`. Output goes to `tmp/sec_audit_report.md` (gitignored). Each run overwrites the previous report.

## Important design decisions

- Profile slugs are derived from name via `slugify()` — profile renames must update both `/profiles` and `stream_profiles` in the site object atomically
- `LoadAccessGroups` in `DataStore` uses a promise singleton (`_accessGroupsPromise`) to prevent concurrent calls returning early with empty data
- `GeneralPanel` initializes `loading` as `true` and awaits stream data, access groups, and profiles in parallel before showing the form — prevents value flicker on load
- After applying a profile, call `Refresh()` (passed from `StreamDetailsPage`) to remount all panels and reload data across tabs
