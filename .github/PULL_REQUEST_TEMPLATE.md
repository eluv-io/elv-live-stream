## PR Summary: Purpose & Testing

*Keep this section brief, focused, and immediately actionable.*

### Purpose
[A single, concise sentence summarizing the *why*. E.g., Implements the new metadata schema required for content publication (JIRA-501).]

### Key Changes
*What files or functions changed?*
* `src/views/ContentEdit.jsx`: [Added form fields for 'Poster Image' and 'Synopsis'.]
* `src/logic/metadata.js`: [Updated `writeMetadata` function to include new path `/public/asset_metadata/cms_info`.]

### How to Test
*The three quickest steps for validation.*
1. Go to the **Content Fabric Browser** and select an existing object (qlib/qobj).
2. Navigate to the **"Manage"** tab.
3. Verify that adding the new `cms_info` structure and saving the object works successfully.

---

## Related Issues / Tickets

*Link to the relevant Jira ticket, GitHub issue, or Trello card.*

Fixes #[ISSUE_NUMBER]

---

## Breaking Changes / Risks

*Check the applicable box and explain any potential risk.*

-   [ ] **No** breaking changes or high-risk areas.
-   [ ] **Yes**, this PR includes breaking changes (Explain the impact and migration path below).
-   [ ] **Potential Risk:** [Explain any risk, e.g., This refactoring touches an area with complex legacy logic.]

---

## Screenshots / Visuals

*If this is a visual change or affects a UI component, include screenshots or a GIF here.*

[Paste screenshots/GIFs here]
