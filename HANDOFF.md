# Handoff Document: scc-language-server

## Status

- **Main repo** (`scc_inspector`): Phase 1 merged, 1 local commit ready to push
- **New repo** (`scc-language-server`): Scaffolded, ready for development

---

## What Was Completed

### Phase 1: Merge to Main
- Centralized EIA-608 data in `scc-core/data/*.json`
- Fixed per-buffer state management bug
- Updated `scc_timecode.py` to use JSON config
- All 114 tests pass

### Phase 2: New Repo Created
- `C:\PythonProjects\scc-language-server`
- LSP server scaffold with hover support
- Client extension for VS Code
- Core modules copied and paths fixed
- Initial commit made

---

## Remaining Work

### In New Repo (`scc-language-server`)

1. **Install dependencies:**
   ```bash
   cd C:\PythonProjects\scc-language-server
   npm install
   ```

2. **Build:**
   ```bash
   npm run compile
   ```

3. **Port buffer state machine** from `scc_inspector.py`:
   - `build_time_map()` (lines 150-400)
   - `build_buffer_snapshot()` (lines 400-543)
   - Create `server/src/sccAnalyzer.ts`

4. **Implement remaining LSP features:**
   - `textDocument/publishDiagnostics` — error detection
   - `textDocument/codeLens` — timing info
   - `scc/lineAnnotations` — custom request for end-of-line decorations

5. **Add tests:**
   - Port Python tests to TypeScript
   - Use shared test cases in `server/test/test-cases/`

6. **Polish:**
   - Update README with screenshots
   - Add VS Code settings for configuration
   - Bundle for publishing

---

## Key Files

| File | Purpose |
|------|---------|
| `server/src/server.ts` | LSP entry point — extend with more capabilities |
| `server/src/sccDecoder.ts` | EIA-608 decoding — complete |
| `server/src/sccTimecode.ts` | Timecode logic — complete |
| `server/src/sccBufferFormat.ts` | Annotation rendering — needs LSP adaptation |
| `server/src/sccTooltip.ts` | Tooltip formatting — rewrite for Markdown |
| `server/data/*.json` | Shared EIA-608 constants |

---

## Reference Documents

- `PORTABILITY_ANALYSIS.md` — Full architecture rationale, LSP mapping, UX redesign
- `REFACTORING_RECOMMENDATIONS.md` — Original refactoring notes (Phase 1 complete)

---

## Original Repo (scc_inspector)

After pushing main:
- Update README to link to `scc-language-server` for VS Code users
- Delete `feature/shared-core-vscode-extension` branch
- Continue maintaining Python plugin independently

---

## Commands Summary

```bash
# In scc_inspector (main)
git push origin main

# In scc-language-server
npm install
npm run compile
# F5 in VS Code to test extension
```