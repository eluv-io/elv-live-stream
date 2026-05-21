# Skill: Release Document Architect

## Trigger
- Activate this skill when the user asks to "update the release log," "summarize my recent work," "check my git branch changes," "summarize my changes on this branch," "create a release document," or "prepare release notes."

## Core Purpose
- To act as an autonomous technical writer that monitors git branch activity, diffs, and commit histories to maintain a live, structured, enterprise-ready Release Document.

## Execution Workflow
When triggered, follow these exact steps:
1. **Analyze Git State:** Check the current branch name and run a git diff against the target branch (usually `main` or `develop`) to see all files modified, added, or deleted.
2. **Read Recent Commits:** Inspect the recent commit messages on this branch to understand the *intent* behind the code changes.
3. **Categorize the Work:** Group the changes into specific, standardized technical categories (Features, Ingest/Routing Updates, Security/DRM, Bug Fixes, Dependency Updates).
4. **Update the Log:** Append or update the running markdown release document (e.g., `tmp/RELEASE_DRAFT.md`) using Eluvio's precise enterprise brand voice.

---

## Output Template & Formatting Rules
When writing or updating the release notes, use this exact structural layout:

### Livestream Manager - Release Version [X.X.X]
**Release Date:** [Target or Current Date]  
**Development:** [Dev Names]  |  **Design:** [Design Names]  |  **Quality:** [QA Names]

#### 1. Executive Summary
[A high-level, authoritative paragraph explaining the business and architectural impact of this release. Focus on how it simplifies workflows, reduces lifecycle management complexity, or introduces critical scaling capabilities.]

#### 2. New Features
[Group new features into logical ecosystem headers based on the git diff, for example:]

##### [Feature Epic Name (e.g., Stream Configuration Profiles)]
[A 1-2 sentence high-level summary of the epic's purpose.]
- **[Feature Name]:** [Clear, specific description of what was added, referencing UI elements like 'high-density Stat Cards', API endpoints, or architectural utilities like atomic stream creation or smart routing.]

##### [Feature Epic Name (e.g., Live Outputs Ecosystem)]
[A 1-2 sentence high-level summary of the epic's purpose.]
- **[Feature Name]:** [Clear, specific description of what was added, referencing full CRUD capabilities, batch operations, or automatic base64url passphrase generation.]

#### 3. Improvements & Enhancements
- **[Enhancement Name]:** [Bullet points detailing advanced streaming support, refined profile logic, CLI expansions, or code optimization. Use exact technical terms like RTP sources, Multipath streaming, dedicated ingress nodes, or deterministic settings merge orders.]

---

## Strict Guidelines
- **No Vague Bullet Points:** Do not just write "fixed files" or "updated code." Be highly specific: "Adjusted frame-boundary detection in the Livestream Manager ingest pipeline."
- **Keep it Accumulative:** Do not overwrite previous sections unless current code changes actively replace old changes. Add new log sections chronologically if tracking multiple days of work.
- **Maintain Contextual Depth:** Ensure technical metrics (like "high-density Output Client Stat Cards" or "base64url passphrases") are accurately extracted from the code changes rather than generalized.
