# Workflow diagrams

Living reference diagrams for key workflows in this app, kept in plain Markdown + Mermaid so they're readable by any LLM or human, in any editor, without extra tooling. GitHub renders Mermaid natively.

This folder is intentionally separate from `.claude/` and `CLAUDE.md` (which are Claude Code-specific and gitignored) — it's meant to be a durable, tool-agnostic reference.

## Conventions

- One file per workflow in this folder, named `<workflow-name>.md`.
- Each file: a short prose summary, a Mermaid diagram (`sequenceDiagram` for call flows, `stateDiagram-v2` for status/lifecycle transitions, `flowchart` for branching logic), then a "Key files" list with `path:line` references.
- Diagrams describe *behavior as implemented*, not aspirational design. When the code changes, update the diagram in the same PR — a stale diagram is worse than no diagram.
- Keep diagrams focused on one workflow each rather than one giant master diagram — easier to keep accurate and to diff.

## Index

- [stream-lifecycle.md](stream-lifecycle.md) — create → configure → start/stop/reset, status polling
- [profile-apply.md](profile-apply.md) — `StreamApplyProfile` flow, `probeCleared` branching
- [save-discard.md](save-discard.md) — cross-tab dirty tracking, Save/Discard, unsaved-changes modal
- [output-lifecycle.md](output-lifecycle.md) — output stream creation/configuration lifecycle