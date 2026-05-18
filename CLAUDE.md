# CLAUDE.md

Project-level guidance for Claude when working in this repo. Read in addition
to (not instead of) the user's chat-level testing standards.

## Framework Quirks & Workarounds

These are jsdom + Mantine 8 + mantine-datatable rough edges we hit while
writing component tests. Apply these patterns automatically — don't
re-discover them.

- **Mantine `<Switch>` toggles need `fireEvent.click`, not `userEvent.click`.**
  Mantine 8 renders the Switch as `<input type="checkbox" role="switch">`
  visually hidden behind a label. `userEvent`'s pointer-events visibility
  check in jsdom rejects the click; `fireEvent.click` bypasses the check and
  still fires `onChange`. Query by `screen.getByRole("switch")` (not
  `"checkbox"` — Mantine sets `role="switch"` explicitly). Same fallback
  applies to small `<ActionIcon>` buttons (copy icon, etc.) when
  `user.click` silently no-ops.

- **`mantine-datatable` doesn't run its column `render(record)` functions
  under jsdom — mock it.** The real library relies on layout measurement
  that jsdom doesn't provide, so cell content never enters the DOM (rows
  exist enough that selection works, but every per-cell interaction silently
  fails). In any test that touches cell contents, register a `vi.mock` for
  `mantine-datatable` with a minimal `<table>` that *does* call each
  column's `render`. Include `aria-label`'d row-select and select-all
  checkboxes if the test exercises selection. Pattern:

  ```js
  vi.mock("mantine-datatable", () => ({
    DataTable: ({records=[], columns=[], selectedRecords=[], onSelectedRecordsChange}) => {
      const selected = new Set((selectedRecords || []).map(r => r.slug));
      return (
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="select-all-rows"
                  checked={records.length > 0 && selected.size === records.length}
                  onChange={(e) => onSelectedRecordsChange?.(e.target.checked ? records : [])}
                />
              </th>
              {columns.map(c => <th key={c.accessor}>{c.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr key={record.slug} data-record-slug={record.slug}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`select-row-${record.slug}`}
                    checked={selected.has(record.slug)}
                    onChange={(e) =>
                      onSelectedRecordsChange?.(
                        e.target.checked
                          ? [...(selectedRecords || []), record]
                          : (selectedRecords || []).filter(r => r.slug !== record.slug)
                      )
                    }
                  />
                </td>
                {columns.map(c => (
                  <td key={c.accessor}>
                    {c.render ? c.render(record) : record[c.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }));
  ```

- **Mantine `Title`/`Text` with `lineClamp` defeats `getByText` exact
  matching.** RTL's default text matcher walks individual text nodes;
  lineClamp can split the visible string across nodes (and ancestors will
  also satisfy a `textContent` check, tripping "Found multiple"). Use this
  matcher to pin the leaf-most element whose `textContent` exactly equals
  the target:

  ```js
  const byTextContent = (text) => (_, el) => {
    if(!el || el.textContent !== text) { return false; }
    return !Array.from(el.children).some(c => c.textContent === text);
  };
  // usage
  screen.getByText(byTextContent(record.name));
  ```

  When the element happens to have a `title` attribute set to the same
  string (e.g., the row-name `<Title title={record.name}>`), prefer
  `screen.getByTitle(record.name)` — it's both unique and intentional.

- **`navigator.clipboard.writeText` in jsdom 27 ignores plain
  `defineProperty` replacement — use `vi.spyOn` instead.** jsdom re-wraps
  the writeText reference after replacement, so a spy installed via
  `Object.defineProperty(navigator, "clipboard", {value: {writeText: spy}})`
  is *not* the function the component ends up calling. Install with
  `vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)`
  in `beforeEach`, and call `vi.restoreAllMocks()` at the top of the same
  `beforeEach` so the spy doesn't leak between tests.

- **Don't let a useEffect-driven async loader reject in tests.** Components
  often call `await store.LoadFoo()` inside `useEffect` without a `try/catch`
  (the store catches internally). If your test mocks `LoadFoo` to *reject*,
  the rejection surfaces as an Unhandled Rejection in vitest. Model the
  store's real behavior instead — resolve the promise but mutate the store
  to its error state (`store.state = "error"`).

- **Stores are imported from `@/stores/index.js`.** Mock with
  `vi.mock("@/stores/index.js", () => ({ outputStore: { ... }, ... }))` and
  mutate the in-memory mock object in `beforeEach` for per-test state. The
  component reads through the same import so changes are visible on the
  next render.

- **Always wrap rendered components in `<MantineProvider>`.** Mantine
  components throw without a provider context. Centralize via a
  `renderWith(ui)` helper in larger test files.

## Reminders

- Test runner / environment / setup file are configured in
  `vitest.config.js`. The setup file (`src/test/setup.js`) already stubs
  `localStorage`, `matchMedia`, `ResizeObserver`, and `scrollIntoView`, and
  suppresses known noisy console messages. Don't re-stub these in
  individual tests.
- See `src/stores/StreamManagementStore.test.js` for the canonical store
  mocking pattern (no React render) and
  `src/pages/outputs/Outputs.test.jsx` for the canonical component test
  pattern (covers all of the quirks above).
