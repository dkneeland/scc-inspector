# SCC Language Server: Implementation Checklist

Quick-reference checklist for tracking progress. Each item references the detailed instructions in `docs/EXECUTION_GUIDE.md`.

---

## Phase 0: Local Setup & First Visual Test
> Details: docs/EXECUTION_GUIDE.md → Phase 0

- [x] Node.js v18+ and npm installed (Step 0.1)
- [x] `npm install` succeeds (Step 0.2)
- [x] `npm run compile` produces `client/out/extension.js` and `server/out/server.js` (Step 0.3)
- [x] `.vscode/launch.json` created (Step 0.4)
- [x] `.vscode/tasks.json` created (Step 0.4)
- [x] F5 opens Extension Development Host (Step 0.5)
- [x] Syntax highlighting visible on `samples/big-buck-bunny.scc` (Step 0.6)
- [x] Hover tooltips work on hex codes (Step 0.6)
- [x] `cd server && npm test` — all tests pass (Step 0.8)

---

## Phase 1: Buffer State Machine
> Details: docs/EXECUTION_GUIDE.md → Phase 1

### Implementation
- [x] `server/src/sccAnalyzer.ts` created with `SccDocument` class (Step 1.1)
- [x] `analyze()` — single-pass state machine builds `timestampMap`, `timeMap`, `lineTexts` (Step 1.1)
- [x] `getBufferSnapshot()` — backwards scan reconstructs buffer state (Step 1.1)
- [x] `checkOverflow()` — detects packets exceeding next timestamp (Step 1.1)
- [x] `SccDocument` wired into `server.ts` on document open/change/close (Step 1.2)

### Tests
- [x] `server/test/analyzer.test.ts` created (Step 1.3)
- [x] `server/test/test-cases/analyzer_cases.json` created (Step 1.3)
- [x] Time map tests: basic pop-on, EDM end time, multiple blocks, ENM clears pending (Step 1.3)
- [x] Buffer snapshot tests: single line, PAC formatting, backwards scan, ENM stops scan (Step 1.3)
- [x] Overflow tests: no overflow, overflow detected, last line safe (Step 1.3)
- [x] Integration test against `big-buck-bunny.scc` (Step 1.3)

### Edge Cases
- [x] Windows line endings (`\r\n`) handled (Step 1.4)
- [x] Null-only lines not added to `pendingLines` (Step 1.4)
- [x] Semicolon timestamps (drop frame) handled (Step 1.4)
- [x] Header line skipped (Step 1.4)
- [x] All prior tests still pass (Step 1.4)

---

## Phase 2: Diagnostics
> Details: docs/EXECUTION_GUIDE.md → Phase 2

### Implementation
- [ ] `collectDiagnostics()` function created (Step 2.2)
- [ ] Parity errors — `SCC001`, Error severity (Step 2.2)
- [ ] Invalid timestamps — `SCC002`, Error severity (Step 2.2)
- [ ] Buffer overflow — `SCC003`, Warning severity (Step 2.2)
- [ ] Never-displayed captions — `SCC004`, Warning severity (Step 2.2)
- [ ] Caption never erased — `SCC005`, Information severity (Step 2.2)
- [ ] Non-monotonic timestamps — `SCC006`, Warning severity (Step 2.2)
- [ ] Diagnostics published on document open and change (Step 2.1)
- [ ] Re-analysis debounced at ~500ms (Step 2.4)
- [ ] Diagnostics cleared on document close (Step 2.5)

### Tests
- [ ] `server/test/diagnostics.test.ts` created (Step 2.6)
- [ ] `samples/test-errors.scc` created with intentional errors (Step 2.6)
- [ ] Parity, timestamp, overflow, never-displayed, non-monotonic test suites pass (Step 2.6)

### Visual Verification
- [ ] Squiggles visible in Extension Development Host (Step 2.6)
- [ ] Problems panel (`Ctrl+Shift+M`) lists all diagnostics (Step 2.6)
- [ ] Clicking a diagnostic jumps to correct position (Step 2.6)

---

## Phase 3: Enhanced Hover Tooltips
> Details: docs/EXECUTION_GUIDE.md → Phase 3

### Implementation
- [ ] Hover shows event description + timestamp with frame offset (Step 3.1)
- [ ] Hover shows buffer state in monospace with caret markers (Step 3.1)
- [ ] Hover shows overflow warning when applicable (Step 3.1)
- [ ] Paired duplicates labeled as ignored (Step 3.3)
- [ ] NULL codes show padding message (Step 3.3)
- [ ] Parity errors explain which byte failed (Step 3.3)
- [ ] Hovering on timestamp shows frame rate and line stats (Step 3.2)
- [ ] Hovering on empty space returns no tooltip (Step 3.2)

### Tests
- [ ] Buffer snapshot highlight tests for TEXT, PAC, MIDROW (Step 3.4)
- [ ] Empty buffer returns -1 highlights (Step 3.4)

### Visual Verification
- [ ] Hover over text codes shows character + buffer (Step 3.4)
- [ ] Hover over control codes shows command name (Step 3.4)
- [ ] Hover over PACs shows row/column/color (Step 3.4)

---

## Phase 4: Inline Annotations
> Details: docs/EXECUTION_GUIDE.md → Phase 4

### Server
- [ ] `scc/lineAnnotations` custom request handler returns segment data (Step 4.2)

### Client
- [ ] Decoration types created for normal and italic text (Step 4.3)
- [ ] `updateAnnotations()` requests data and applies decorations (Step 4.3)
- [ ] Decorations update on document change (debounced) and editor switch (Step 4.3)
- [ ] `sccInspector.annotationsEnabled` toggle works (Step 4.5)

### Edge Cases
- [ ] Control-only lines have no annotation (Step 4.6)
- [ ] Long decoded text truncated (Step 4.6)
- [ ] Dark and light themes render correctly (Step 4.6)

### Visual Verification
- [ ] Decoded text appears at end of data lines in dimmed color (Step 4.7)
- [ ] Timing brackets visible: `[HH:MM:SS:FF → HH:MM:SS:FF]` (Step 4.7)
- [ ] Never-displayed captions marked (Step 4.7)

---

## Phase 5: Code Lenses & Advanced Features
> Details: docs/EXECUTION_GUIDE.md → Phase 5

- [ ] Frame rate code lens at file header (Step 5.1)
- [ ] Error summary code lens linking to Problems panel (Step 5.1)
- [ ] Caption duration lenses above EOC lines (Step 5.1)
- [ ] Document symbols populate Outline panel (Step 5.2)
- [ ] `sccInspector.frameRateOverride` setting works (Step 5.3)

---

## Phase 6: Polish & Publish
> Details: docs/EXECUTION_GUIDE.md → Phase 6

- [ ] esbuild bundles server and client to single files (Step 6.1)
- [ ] Extension icon created (Step 6.2)
- [ ] README with screenshots (Step 6.3)
- [ ] `vsce package` produces clean `.vsix` (Step 6.4)
- [ ] `.vsix` installs and all features work (Step 6.4)
- [ ] CI pipeline in `.github/workflows/ci.yml` (Step 6.5)
- [ ] Published to VS Code Marketplace (Step 6.4)

---

## Phase 7: Multi-Editor Support
> Details: docs/EXECUTION_GUIDE.md → Phase 7

- [ ] `scc-language-server --stdio` works standalone (Step 7.1)
- [ ] Neovim setup documented and tested (Step 7.2)
- [ ] Sublime Text setup documented (Step 7.3)
