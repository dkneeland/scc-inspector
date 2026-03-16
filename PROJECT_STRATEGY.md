# SCC Language Server: Project Strategy & Phased Rollout

## Vision

Rebuild the SCC Inspector — originally a Notepad++ Python plugin — as a **Language Server Protocol (LSP) server** in TypeScript. This makes SCC file analysis available to any LSP-compatible editor (VS Code first, then Neovim, Sublime, etc.) without rewriting the core logic for each platform.

The original plugin was constrained by Notepad++'s Python Script environment: Python 2.7, synchronous Scintilla API calls, a 1000-line backwards scan limit, and no way to extend it beyond Notepad++. This new implementation removes all of those limitations.

---

## What We're Building

An editor-agnostic SCC (Scenarist Closed Caption / EIA-608) analysis tool that provides:

1. **Hover tooltips** — Decode any hex code under the cursor: character, control command, PAC positioning, midrow style change, with buffer context and timestamp offset
2. **Diagnostics (errors/warnings)** — Parity errors, invalid timestamps, buffer overflow, never-displayed captions
3. **Inline annotations** — Decoded caption text shown at the end of each SCC line with display timing (start -> end)
4. **Code lenses** — Timing metadata above caption blocks (frame rate, duration, gap between captions)
5. **TextMate grammar** — Syntax highlighting for SCC files (timestamps, hex codes, control codes, PACs)

### Architecture

```
┌─────────────────────────────────────┐
│         Editor Clients              │
│  ┌─────────┐ ┌──────┐ ┌─────────┐  │
│  │ VS Code │ │ nvim │ │ Sublime │  │
│  └────┬────┘ └──┬───┘ └────┬────┘  │
│       │         │          │        │
│       └─────────┼──────────┘        │
│            LSP Protocol             │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│      scc-language-server (npm)      │
│                                     │
│  server.ts          LSP entry point │
│  sccAnalyzer.ts     State machine   │
│  sccDecoder.ts      EIA-608 decode  │
│  sccTimecode.ts     Timecode math   │
│  sccBufferFormat.ts Annotations     │
│  sccTooltip.ts      Tooltip format  │
│  data/*.json        EIA-608 tables  │
└─────────────────────────────────────┘
```

The server is published as an npm package (`scc-language-server`) with a `bin` entry so it can be installed globally or used as a dependency. Each editor client is a thin wrapper that launches the server and maps LSP responses to editor-native UI.

---

## Current State (as of 2026-03-15)

### Complete
- **sccDecoder.ts** — Full EIA-608 hex code parsing: TEXT, PAC, MIDROW, CONTROL, INDENT, NULL, ERROR classification. Parity validation. Pair detection. 1000+ test cases.
- **sccTimecode.ts** — Frame rate detection (23.98, 25, 29.97 DF/NDF), timecode parsing, arithmetic with cadence/drop-frame, comparison, packet difference via binary search. 200+ test cases.
- **sccBufferFormat.ts** — Single-pass annotation rendering with italic state tracking.
- **sccTooltip.ts** — Tooltip composition with buffer markers, word wrapping, and separator formatting.
- **TextMate grammar** — Syntax highlighting for SCC files in VS Code.
- **LSP scaffold** — Server initializes, negotiates capabilities, handles `textDocument/hover` for hex code decoding.
- **VS Code client** — Extension launches server via IPC, registers SCC language.
- **Shared data files** — All 6 JSON data files (char_map, colors, control_commands, frame_rates, parity_table, row_map) shared with the original project.

### Not Started
- **sccAnalyzer.ts** — The buffer state machine (the core intelligence). Must port `build_time_map()` and `build_buffer_snapshot()` from the original Python.
- **Diagnostics** — `textDocument/publishDiagnostics` for error detection.
- **Code Lenses** — `textDocument/codeLens` for timing metadata.
- **Line Annotations** — Custom `scc/lineAnnotations` request + VS Code decoration adapter.
- **Configuration UI** — VS Code settings for toggling features.
- **Publishing** — npm package, VS Code Marketplace listing, CI/CD.

---

## Phased Rollout

### Phase 1: Buffer State Machine (`sccAnalyzer.ts`)
**Goal:** Port the brain of the tool — the state machine that tracks caption buffer contents as it processes an SCC file.

**Deliverables:**
- [ ] Create `server/src/sccAnalyzer.ts`
- [ ] Port `build_time_map()` — single-pass algorithm that:
  - Builds `timestamp_map`: line -> (timestamp, packet_count)
  - Builds `time_map`: line -> [start_time, end_time]
  - Tracks pending lines (TEXT/PAC waiting for EOC) and active lines (EOC -> EDM)
  - Detects never-displayed captions
- [ ] Port `build_buffer_snapshot()` — reconstructs buffer state up to any word position by scanning backwards
- [ ] Expose an `SccDocument` class that caches analysis results per-document (keyed by content hash)
- [ ] Remove the original 1000-line scan depth limit (no longer needed without UI-thread concerns)
- [ ] Port buffer-related test cases from Python to TypeScript
- [ ] All existing tests continue to pass

**Why this is Phase 1:** Every subsequent feature depends on the state machine. Diagnostics need `time_map` to find errors. Annotations need it to show decoded text. Tooltips need `build_buffer_snapshot` for buffer context.

**Key design decisions:**
- No scan depth limit. The LSP server runs in its own process, so long scans don't freeze the UI.
- Cache analysis results per-document with content hash validation (same pattern as the original).
- The `SccDocument` class owns the full analysis lifecycle: parse -> analyze -> cache -> query.

---

### Phase 2: Diagnostics
**Goal:** Real-time error detection displayed as squiggles/markers in the editor.

**Deliverables:**
- [ ] Implement `textDocument/publishDiagnostics` in server.ts
- [ ] Parity errors (Error severity) — invalid odd-parity bytes on hex codes
- [ ] Invalid timestamps (Error) — malformed HH:MM:SS:FF format or out-of-range values
- [ ] Buffer overflow (Warning) — more packets between timestamps than frames allow
- [ ] Never-displayed captions (Warning) — caption data that never reaches EOC/EDM
- [ ] Non-monotonic timestamps (Warning) — timestamps that go backwards
- [ ] Re-publish diagnostics on document change
- [ ] Add diagnostic test cases

**Why this is Phase 2:** Diagnostics are the highest-value LSP feature — they provide passive, always-on error detection without any user interaction. This is where LSP immediately surpasses the original Notepad++ plugin (which only showed errors after a manual refresh).

---

### Phase 3: Enhanced Hover Tooltips
**Goal:** Rich, context-aware hover tooltips that show decoded meaning + buffer state.

**Deliverables:**
- [ ] Enhance existing hover handler to include:
  - Current buffer state snapshot (what's on screen at this point in the file)
  - Timestamp with frame-rate-aware packet offset
  - Buffer overflow warning if applicable
  - Caption display timing (when it appears, when it's erased)
- [ ] Format tooltips as Markdown with monospace buffer display
- [ ] Handle edge cases: hover on timestamps, hover on header line, hover on empty lines

**Why this is Phase 3:** The basic hover already works. This phase enriches it with buffer context (which requires Phase 1's state machine).

---

### Phase 4: Inline Annotations
**Goal:** Show decoded caption text at the end of each SCC line, with display timing.

**Deliverables:**
- [ ] Implement custom `scc/lineAnnotations` LSP request that returns per-line annotation data
- [ ] VS Code client: register `DecorationProvider` that calls `scc/lineAnnotations` and renders:
  - Decoded text after each line (dimmed, italic for italic segments)
  - Display timing: `[01:23:45:00 -> 01:23:48:15]`
  - Error indicators (red for parity errors, orange for warnings)
- [ ] Update annotations on document change (debounced)
- [ ] Add configuration toggle: `sccInspector.showAnnotations` (default: true)

**Why this is Phase 4:** Annotations are the signature UX feature of the original plugin, but they require client-side decoration APIs that are editor-specific. The server provides the data; the client renders it. This is where the VS Code client diverges from a pure-LSP implementation.

---

### Phase 5: Code Lenses & Advanced Features
**Goal:** Timing metadata above caption blocks + quality-of-life features.

**Deliverables:**
- [ ] Implement `textDocument/codeLens`:
  - Frame rate indicator at file header
  - Duration + gap timing above each caption block
  - Error count summary lens at top of file
- [ ] Implement `textDocument/completion` for common control code patterns
- [ ] Add `sccInspector.frameRateOverride` setting (for files where auto-detect fails)
- [ ] Add `textDocument/documentSymbol` — outline view showing caption blocks with timestamps
- [ ] Semantic token provider for richer highlighting (colors matching caption colors, etc.)

---

### Phase 6: Polish & Publish
**Goal:** Production-ready release on VS Code Marketplace and npm.

**Deliverables:**
- [ ] Package `scc-language-server` for npm with proper exports
- [ ] Bundle VS Code extension with esbuild (single-file output)
- [ ] Write README with screenshots and feature walkthrough
- [ ] Add CI/CD pipeline (GitHub Actions: lint, test, build, publish)
- [ ] VS Code Marketplace listing with icon, categories, and tags
- [ ] Create `.vsix` for offline installation
- [ ] Add telemetry opt-in for usage analytics (optional)

---

### Phase 7: Multi-Editor Support
**Goal:** Extend beyond VS Code to other editors.

**Deliverables:**
- [ ] Neovim client (Lua) — lspconfig entry + decoration via extmarks
- [ ] Sublime Text client — LSP package configuration
- [ ] Documentation for generic LSP client setup
- [ ] Test matrix across editors

---

## Key Design Principles

1. **Server does the thinking, client does the rendering.** All SCC analysis lives in the server. Editor clients are thin adapters that map LSP responses to native UI. This keeps the core logic portable.

2. **Shared data files.** The JSON data files (`char_map.json`, `colors.json`, etc.) are identical between the original Python project and this TypeScript server. Changes to EIA-608 data propagate to both.

3. **No artificial limits.** The original plugin had a 1000-line backward scan limit to prevent UI freezes. The LSP server runs in its own process, so it can analyze the entire file without concern.

4. **Incremental analysis.** Documents are re-analyzed on change, but results are cached by content hash. Only changed documents trigger recomputation.

5. **Standards-first.** Use standard LSP features wherever possible (diagnostics, hover, code lens, completion). Only use custom requests (`scc/lineAnnotations`) when no standard feature fits.

6. **Test parity.** All test cases from the original project are ported and shared via JSON. New features get new test cases in the same format.

---

## Feature Comparison: Original vs. LSP

| Feature | Notepad++ Plugin | LSP Server (Target) |
|---------|-----------------|---------------------|
| Syntax highlighting | UDL (XML) | TextMate grammar |
| Hover tooltips | Scintilla calltip | LSP hover (Markdown) |
| Error indicators | Scintilla indicators | LSP diagnostics |
| Inline annotations | Scintilla annotations | Custom request + decorations |
| Timing display | Annotations | Code lenses |
| Buffer state | 1000-line scan limit | Full file analysis |
| Frame rate display | Console message | Code lens at header |
| Error summary | Top-of-file annotation | Diagnostic summary lens |
| Configuration | None | VS Code settings UI |
| Multi-editor | Notepad++ only | Any LSP client |
| Language | Python 2.7 | TypeScript (Node.js) |
| Real-time updates | Manual refresh | On-change (debounced) |
| Roll-up captions | Partial | Full support (planned) |

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Client-side decorations vary by editor | Annotations may look different across editors | Server provides structured data; each client renders natively. VS Code is the reference implementation. |
| Large SCC files (10k+ lines) could be slow | Hover/diagnostics lag | Incremental parsing, debounced re-analysis, content-hash caching |
| EIA-608 edge cases (multi-channel, XDS) | Incorrect decoding | Expand test suite with real-world SCC files; add channel filtering |
| Drop-frame timecode bugs | Wrong timing calculations | Binary search + comprehensive frame rate test cases already cover this |

---

## Success Criteria

- All 1000+ existing test cases pass in TypeScript
- VS Code extension installs from Marketplace and works on first open of an SCC file
- Hover, diagnostics, and annotations work correctly on the sample `big-buck-bunny.scc`
- Performance: analysis completes in <500ms for files up to 10,000 lines
- At least one non-VS Code editor (Neovim) can use the server with basic features
